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

        while (true) {
            const batch = await prisma.tenant.findMany({
                where: { status: true },
                take: BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                orderBy: { id: "asc" },
            });

            if (batch.length === 0) break;
            checked += batch.length;

            const expired = batch.filter(t => getLicenseStatus(t) === "EXPIRED");

            if (expired.length > 0) {
                // 1. Desativar em lote — uma query
                await prisma.tenant.updateMany({
                    where: { id: { in: expired.map(t => t.id) } },
                    data: { status: false },
                });

                // 2. Invalidar cache Redis em paralelo
                await Promise.allSettled(
                    expired.map(t => redis.del(`license:${t.appKey}`).catch(() => {}))
                );

                // 3. Notificar em paralelo
                const notifyResults = await Promise.allSettled(
                    expired.map(t => notifyLicenseStatus({ companyId: t.companyId, status: "inactive" }))
                );

                // 4. Marcar pendentes em lote para quem falhou
                const failedIds = expired
                    .filter((_, i) => {
                        const r = notifyResults[i];
                        return r?.status === "rejected" || (r?.status === "fulfilled" && !r.value);
                    })
                    .map(t => t.id);

                if (failedIds.length > 0) {
                    await prisma.tenant.updateMany({
                        where: { id: { in: failedIds } },
                        data: { notifyPending: true },
                    });
                }

                deactivated += expired.length;
            }

            cursor = batch[batch.length - 1]?.id;
            if (batch.length < BATCH_SIZE) break;
        }

        // Retry pendentes em paralelo
        const pending = await prisma.tenant.findMany({ where: { notifyPending: true } });

        const retryResults = await Promise.allSettled(
            pending.map(t => notifyLicenseStatus({
                companyId: t.companyId,
                status: t.status ? "active" : "inactive",
            }))
        );

        const retriedIds = pending
            .filter((_, i) => {
                const r = retryResults[i];
                return r?.status === "fulfilled" && r.value === true;
            })
            .map(t => t.id);

        if (retriedIds.length > 0) {
            await prisma.tenant.updateMany({
                where: { id: { in: retriedIds } },
                data: { notifyPending: false },
            });
        }

        res.json({
            message: "Sincronização concluída.",
            checked,
            deactivated,
            retried: retriedIds.length,
            stillPending: pending.length - retriedIds.length,
        });
    } catch (error) {
        console.error("[cron] Erro ao sincronizar tenants expirados:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};