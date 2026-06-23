import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { licenseRateLimit } from '../middlewares/rate-limit';
import { getLicenseStatus } from '../utils/license';

const router = Router();
const CACHE_PREFIX = 'license';

router.get('/validate/:appKey', licenseRateLimit, async (req, res) => {
    const rawAppKey = req.params.appKey;

    const appKey = Array.isArray(rawAppKey) ? rawAppKey[0] : rawAppKey;

    // Rejeita chaves com formato inválido antes de consultar o banco
    if (!appKey  || !/^ak_[a-f0-9]{32}$/.test(appKey)) {
        res.status(400).json({ error: 'Formato de chave inválido.' });
        return;
    }

  // Tenta cache primeiro
  try {
    const cached = await redis.get(`${CACHE_PREFIX}:${appKey}`);
    if (cached) {
      const { statusCode, body } = JSON.parse(cached) as { statusCode: number; body: object };
      res.status(statusCode).json(body);
      return;
    }
  } catch {
    // Redis indisponível: continua sem cache
  }

  const tenant = await prisma.tenant.findUnique({ where: { appKey } });

  if (!tenant) {
    res.status(404).json({ error: 'Licença não encontrada.' });
    return;
  }

  // Atualiza lastAccess de forma assíncrona (não bloqueia a resposta)
  prisma.tenant
    .update({ where: { appKey }, data: { lastAccess: new Date() } })
    .catch(() => {});

  const licenseStatus = getLicenseStatus(tenant);

  let statusCode: number;
  let body: object;
  let cacheTtl: number;

  if (licenseStatus === 'ACTIVE') {
    statusCode = 200;
    body = {
      valid:     true,
      status:    'ACTIVE',
      tenant:    tenant.companyName,
      plan:      tenant.plan,
      expiresAt: tenant.expiresAt,
    };
    // Cache até expirar (máximo 1 hora)
    const secondsLeft = Math.floor((tenant.expiresAt.getTime() - Date.now()) / 1000);
    cacheTtl = Math.min(secondsLeft, 3600);

  } else if (licenseStatus === 'GRACE_PERIOD') {
    statusCode = 200;
    body = {
      valid:     true,
      status:    'GRACE_PERIOD',
      tenant:    tenant.companyName,
      plan:      tenant.plan,
      expiresAt: tenant.expiresAt,
      warning:   'Licença expirada. Período de carência ativo — renove para não perder o acesso.',
    };
    cacheTtl = 300; // 5 minutos no período de carência

  } else {
    statusCode = 403;
    body = {
      valid:  false,
      status: licenseStatus === 'INACTIVE' ? 'INACTIVE' : 'EXPIRED',
      error:  licenseStatus === 'INACTIVE' ? 'Licença inativa.' : 'Licença expirada.',
    };
    cacheTtl = 120; // 2 minutos para licenças bloqueadas
  }

  try {
    if (cacheTtl > 0) {
      await redis.setex(`${CACHE_PREFIX}:${appKey}`, cacheTtl, JSON.stringify({ statusCode, body }));
    }
  } catch {
    // Sem cache, sem problema
  }

  res.status(statusCode).json(body);
});

export default router;