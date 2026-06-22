// src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: { role: string; id: string };
}

export const verifyAdminJWT = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token de autenticação não fornecido ou formato inválido.' });
        return;
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        res.status(401).json({ error: 'Token ausente no cabeçalho.' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as unknown as { role: string; id: string };
        
        if (decoded.role !== 'ADMIN') {
            res.status(403).json({ error: 'Acesso negado. Nível de privilégio insuficiente.' });
            return;
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token expirado ou inválido.' });
    }
};