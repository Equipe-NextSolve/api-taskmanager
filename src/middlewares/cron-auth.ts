import { Request, Response, NextFunction } from "express";

export function verifyCronSecret(req: Request, res: Response, next: NextFunction): void {
    const secret = req.headers["x-cron-secret"];
    if (!secret || secret !== process.env.SYNC_CRON_SECRET) {
        res.status(401).json({ error: "Não autorizado." });
        return;
    }
    next();
}