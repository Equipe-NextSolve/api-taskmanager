import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { getLicenseStatus } from "../utils/license";
import { notifyLicenseStatus } from "../utils/notifyLicenseStatus";

export const syncExpiredTenants = async (req: Request, res: Response): Promise<void> => {
    try {
        const activeTenants = await prisma.tenant.findMany({ where: { status: true } });
        let deactivated = 0;

        for (const tenant of activeTenants) {
            if (getLicenseStatus(tenant) !== "EXPIRED") continue;

            await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                    status: false,
                    logs: { create: { action: "AUTO_DEACTIVATED_EXPIRED" } },
                },
            });

            await redis.del(`license:${tenant.appKey}`).catch(() => {});
            await notifyLicenseStatus({ companyId: tenant.companyId, status: "inactive" });
            deactivated++;
        }

        res.json({ message: "Sincronização concluída.", checked: activeTenants.length, deactivated });
    } catch (error) {
        console.error("[cron] Erro ao sincronizar tenants expirados:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};