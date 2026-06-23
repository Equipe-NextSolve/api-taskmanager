import { Request, Response, NextFunction } from 'express';

export function verifyAsaasWebhook(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['asaas-access-token'];
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;

  if (!expected) {
    // Sem token configurado: só avisa no log (útil em dev)
    console.warn('[webhook] ASAAS_WEBHOOK_TOKEN não configurado — validação desativada');
    next();
    return;
  }

  if (!token || token !== expected) {
    res.status(401).json({ error: 'Webhook não autorizado.' });
    return;
  }

  next();
}