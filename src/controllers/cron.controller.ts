import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { getLicenseStatus } from "../utils/license";
import { notifyLicenseStatus } from "../utils/notifyLicenseStatus";

const BATCH_SIZE = 100;

export const syncExpiredTenants = async (req: Request, res: Response): Promise<void> => {
    try {
        let checked = 0;
        let deactivated = 0;
        let cursor: string | undefined;

        // 1. Percorre tenants ativos em lotes, verificando quem expirou
        while (true) {
            const batch = await prisma.tenant.findMany({
                where: { status: true },
                take: BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                orderBy: { id: "asc" },
            });

            if (batch.length === 0) break;

            for (const tenant of batch) {
                checked++;
                if (getLicenseStatus(tenant) !== "EXPIRED") continue;

                await prisma.tenant.update({
                    where: { id: tenant.id },
                    data: {
                        status: false,
                        logs: { create: { action: "AUTO_DEACTIVATED_EXPIRED" } },
                    },
                });

                await redis.del(`license:${tenant.appKey}`).catch(() => {});

                const notified = await notifyLicenseStatus({ companyId: tenant.companyId, status: "inactive" });
                await prisma.tenant.update({
                    where: { id: tenant.id },
                    data: { notifyPending: !notified },
                });

                deactivated++;
            }

            cursor = batch[batch.length - 1]?.id;
            if (batch.length < BATCH_SIZE) break;
        }

        // 2. Tenta de novo qualquer tenant cuja última notificação falhou
        // (pagamento confirmado, desativação manual ou expiração acima)
        const pending = await prisma.tenant.findMany({ where: { notifyPending: true } });
        let retried = 0;

        for (const tenant of pending) {
            const notified = await notifyLicenseStatus({
                companyId: tenant.companyId,
                status: tenant.status ? "active" : "inactive",
            });

            if (notified) {
                await prisma.tenant.update({ where: { id: tenant.id }, data: { notifyPending: false } });
                retried++;
            }
        }

        res.json({
            message: "Sincronização concluída.",
            checked,
            deactivated,
            retried,
            stillPending: pending.length - retried,
        });
    } catch (error) {
        console.error("[cron] Erro ao sincronizar tenants expirados:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};