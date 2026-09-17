import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { calculateNewExpiry } from '../utils/license';
import { verifyAsaasWebhook } from '../middlewares/webhook-auth';
import { webhookRateLimit } from '../middlewares/rate-limit';
import { notifyLicenseStatus } from '../utils/notifyLicenseStatus';

const router = Router();

const HANDLED_EVENTS = [
    'PAYMENT_CONFIRMED',               // Cartão aprovado (mais rápido que RECEIVED)
    'PAYMENT_RECEIVED',                // PIX confirmado / cartão liquidado
    'PAYMENT_OVERDUE',
    'PAYMENT_DELETED',
    'PAYMENT_REPROVED_BY_RISK_ANALYSIS', // Cartão recusado por análise de risco
];

router.post('/asaas', webhookRateLimit, verifyAsaasWebhook, async (req, res) => {
    const event = req.body;

    if (!HANDLED_EVENTS.includes(event.event)) {
        res.status(200).send();
        return;
    }

    const customerId: string | undefined = event.payment?.customer;
    const paymentId: string | undefined = event.payment?.id;

    if (!customerId || !paymentId) {
        console.warn('[webhook] Evento sem customer ID ou payment ID', event);
        res.status(200).send();
        return;
    }

    // Idempotência por evento + pagamento (evita reprocessar duplicatas do mesmo evento)
    const idempotencyKey = `webhook:processed:${event.event}:${paymentId}`;
    try {
        const alreadyProcessed = await redis.get(idempotencyKey);
        if (alreadyProcessed) {
            console.log(`[webhook] ${event.event}/${paymentId} já processado — ignorando duplicata.`);
            res.status(200).send();
            return;
        }
    } catch {
        console.warn('[webhook] Redis indisponível para idempotência, continuando...');
    }

    try {
        const tenant = await prisma.tenant.findUnique({ where: { asaasCustomerId: customerId } });

        if (!tenant) {
            console.warn(`[webhook] Tenant não encontrado para customerId: ${customerId}`);
            res.status(200).send();
            return;
        }

        if (event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED') {
            // PAYMENT_CONFIRMED chega primeiro para cartão de crédito.
            // PAYMENT_RECEIVED chega depois (liquidação) para cartão, ou imediatamente para PIX.
            // Para evitar renovação dupla (cartão): usamos uma chave de "ativação" por paymentId.
            const activationKey = `webhook:activated:${paymentId}`;
            let alreadyActivated = false;
            try {
                alreadyActivated = !!(await redis.get(activationKey));
            } catch { /* Redis indisponível, prossegue */ }

            if (alreadyActivated) {
                // PAYMENT_RECEIVED chegando depois do PAYMENT_CONFIRMED para o mesmo pagamento:
                // licença já foi ativada — apenas loga, não renova de novo.
                console.log(`[webhook] Licença já ativada para ${paymentId} — PAYMENT_RECEIVED ignorado (cartão liquidado).`);
            } else {
                const newExpiry = calculateNewExpiry(tenant.expiresAt);

                await prisma.tenant.update({
                    where: { asaasCustomerId: customerId },
                    data: {
                        expiresAt: newExpiry,
                        status: true,
                        firstPurchaseDate: tenant.firstPurchaseDate ?? new Date(),
                        logs: {
                            create: {
                                action: event.event,
                                details: `Asaas paymentId: ${paymentId}. Nova expiração: ${newExpiry.toISOString()}`,
                            },
                        },
                    },
                });

                const notified = await notifyLicenseStatus({
                    companyId: tenant.companyId,
                    status: 'active',
                    licenseExpiresAt: newExpiry,
                    plan: tenant.plan,
                });

                await prisma.tenant.update({
                    where: { asaasCustomerId: customerId },
                    data: { notifyPending: !notified },
                });

                await redis.del(`license:${tenant.appKey}`).catch(() => {});

                // Marca como ativado para este paymentId (48h — cobre o ciclo de liquidação do cartão)
                await redis.set(activationKey, '1', 'EX', 60 * 60 * 48).catch(() => {});

                console.log(`[webhook] Licença ativada via ${event.event}: ${tenant.companyName} → ${newExpiry.toISOString()}`);
            }

        } else if (event.event === 'PAYMENT_REPROVED_BY_RISK_ANALYSIS') {
            // Cartão recusado pela análise de risco do ASAAS — desativa e notifica o usuário
            await prisma.tenant.update({
                where: { asaasCustomerId: customerId },
                data: {
                    status: false,
                    logs: {
                        create: {
                            action: 'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
                            details: `Asaas paymentId: ${paymentId}. Cartão reprovado por análise de risco.`,
                        },
                    },
                },
            });

            const notified = await notifyLicenseStatus({
                companyId: tenant.companyId,
                status: 'inactive',
                plan: tenant.plan,
            });

            await prisma.tenant.update({
                where: { asaasCustomerId: customerId },
                data: { notifyPending: !notified },
            });

            await redis.del(`license:${tenant.appKey}`).catch(() => {});
            console.log(`[webhook] Cartão reprovado por risco: ${tenant.companyName}`);

        } else if (event.event === 'PAYMENT_OVERDUE') {
            await prisma.tenant.update({
                where: { asaasCustomerId: customerId },
                data: {
                    logs: {
                        create: {
                            action: 'PAYMENT_OVERDUE',
                            details: `Asaas paymentId: ${paymentId}. Vencimento original: ${tenant.expiresAt.toISOString()}`,
                        },
                    },
                },
            });
            console.log(`[webhook] Pagamento vencido: ${tenant.companyName}`);

        } else if (event.event === 'PAYMENT_DELETED') {
            await prisma.tenant.update({
                where: { asaasCustomerId: customerId },
                data: {
                    logs: {
                        create: {
                            action: 'PAYMENT_DELETED',
                            details: `Asaas paymentId: ${paymentId} removido.`,
                        },
                    },
                },
            });
            console.log(`[webhook] Cobrança removida: ${tenant.companyName}`);
        }

        await redis.set(idempotencyKey, '1', 'EX', 60 * 60 * 48).catch(() => {});

    } catch (error) {
        console.error('[webhook] Erro ao processar evento:', error);
    }

    res.status(200).send();
});

export default router;