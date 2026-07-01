import { Request, Response, NextFunction } from 'express';

export function verifyAsaasWebhook(req: Request, res: Response, next: NextFunction): void {
    const token = req.headers['asaas-access-token'];
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;

    if (!expected) {
        const isProd = process.env.NODE_ENV === 'production';
            if (isProd) {
                console.error('[webhook] ASAAS_WEBHOOK_TOKEN não configurado em produção — bloqueando.');
                res.status(500).json({ error: 'Servidor mal configurado.' });
                return;
            }
            
        // Em desenvolvimento apenas avisa
        console.warn('[webhook] ASAAS_WEBHOOK_TOKEN não configurado — validação desativada');
        next();
        return;
    }

    if (!token || token !== expected) {
        console.warn('[webhook] Token inválido recebido:', token);
        res.status(401).json({ error: 'Webhook não autorizado.' });
        return;
    }

    next();
}