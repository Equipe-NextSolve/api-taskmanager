import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

export function verifyCronSecret(req: Request, res: Response, next: NextFunction): void {
    const secret = req.headers["x-cron-secret"];
    const expected = process.env.SYNC_CRON_SECRET;

    if (!expected) {
        console.error("[cron] SYNC_CRON_SECRET não configurado — bloqueando.");
        res.status(500).json({ error: "Servidor mal configurado." });
        return;
    }

    try {
        const secretBuf = Buffer.from(String(secret ?? ""));
        const expectedBuf = Buffer.from(expected);

        const valid = secretBuf.length === expectedBuf.length &&
            timingSafeEqual(secretBuf, expectedBuf);

        if (!valid) {
            console.warn("[cron] Tentativa de acesso com segredo inválido.");
            res.status(401).json({ error: "Não autorizado." });
            return;
        }
    } catch {
        res.status(401).json({ error: "Não autorizado." });
        return;
    }

    next();
}