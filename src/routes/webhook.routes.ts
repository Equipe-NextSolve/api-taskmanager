import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { calculateNewExpiry } from '../utils/license';
import { verifyAsaasWebhook } from '../middlewares/webhook-auth';
import { webhookRateLimit } from '../middlewares/rate-limit';

const router = Router();

router.post('/asaas', webhookRateLimit, verifyAsaasWebhook, async (req, res) => {
    const event = req.body;

    if (event.event !== 'PAYMENT_RECEIVED') {
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

    // Idempotência: verifica se este paymentId já foi processado
    const idempotencyKey = `webhook:processed:${paymentId}`;
    try {
        const alreadyProcessed = await redis.get(idempotencyKey);
        if (alreadyProcessed) {
            console.log(`[webhook] Pagamento ${paymentId} já processado — ignorando duplicata.`);
            res.status(200).send();
            return;
        }
    } catch {
        // Se Redis falhar, continua — melhor processar duas vezes do que não processar
        console.warn('[webhook] Redis indisponível para idempotência, continuando...');
    }

    try {
        const tenant = await prisma.tenant.findUnique({ where: { asaasCustomerId: customerId } });

        if (!tenant) {
            console.warn(`[webhook] Tenant não encontrado para customerId: ${customerId}`);
            res.status(200).send();
            return;
        }

        const newExpiry = calculateNewExpiry(tenant.expiresAt);

        await prisma.tenant.update({
            where: { asaasCustomerId: customerId },
            data: {
                expiresAt: newExpiry,
                status: true,
                firstPurchaseDate: tenant.firstPurchaseDate ?? new Date(),
                logs: {
                    create: {
                        action: 'PAYMENT_RECEIVED',
                        details: `Asaas paymentId: ${paymentId}. Nova expiração: ${newExpiry.toISOString()}`,
                    },
                },
            },
        });

        await redis.set(idempotencyKey, '1', 'EX', 60 * 60 * 48).catch(() => {});

        // Invalida cache de licença
        await redis.del(`license:${tenant.appKey}`).catch(() => {});

        console.log(`[webhook] Licença renovada: ${tenant.companyName} → ${newExpiry.toISOString()}`);

    } catch (error) {
        console.error('[webhook] Erro ao processar pagamento:', error);
    }

    res.status(200).send();
});

export default router;