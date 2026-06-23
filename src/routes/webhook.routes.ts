import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { calculateNewExpiry } from '../utils/license';
import { verifyAsaasWebhook } from '../middlewares/webhook-auth';
import { webhookRateLimit } from '../middlewares/rate-limit';

const router = Router();

router.post('/asaas', webhookRateLimit, verifyAsaasWebhook, async (req, res) => {
  // Responde 200 imediatamente — Asaas não vai re-tentar
  res.status(200).send();

  const event = req.body;
  if (event.event !== 'PAYMENT_RECEIVED') return;

  const customerId: string | undefined = event.payment?.customer;
  if (!customerId) {
    console.warn('[webhook] Evento sem customer ID', event);
    return;
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { asaasCustomerId: customerId } });
    if (!tenant) {
      console.warn(`[webhook] Tenant não encontrado para customerId: ${customerId}`);
      return;
    }

    // Lógica correta: estende do fim do período atual, não de hoje
    const newExpiry = calculateNewExpiry(tenant.expiresAt);

    await prisma.tenant.update({
      where: { asaasCustomerId: customerId },
      data: {
        expiresAt:        newExpiry,
        status:           true,
        firstPurchaseDate: tenant.firstPurchaseDate ?? new Date(),
        logs: {
          create: {
            action:  'PAYMENT_RECEIVED',
            details: `Asaas paymentId: ${event.payment?.id ?? 'n/a'}. Nova expiração: ${newExpiry.toISOString()}`,
          },
        },
      },
    });

    // Invalida cache para a próxima validação buscar o dado atualizado
    await redis.del(`license:${tenant.appKey}`).catch(() => {});

    console.log(`[webhook] Licença renovada: ${tenant.companyName} → ${newExpiry.toISOString()}`);
  } catch (error) {
    console.error('[webhook] Erro ao processar pagamento:', error);
  }
});

export default router;