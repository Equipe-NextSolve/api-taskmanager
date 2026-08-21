import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export async function verifyAppKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    const appKey = req.headers['x-app-key'] as string;

    if (!appKey || !/^ak_[a-f0-9]{32}$/.test(appKey)) {
        res.status(401).json({ error: 'App key inválida.' });
        return;
    }

    try {
        const tenant = await prisma.tenant.findUnique({ where: { appKey } });
        if (!tenant) {
            res.status(401).json({ error: 'Empresa não encontrada.' });
            return;
        }
        (req as any).tenant = tenant;
        next();
    } catch {
        res.status(500).json({ error: 'Erro interno.' });
    }
}