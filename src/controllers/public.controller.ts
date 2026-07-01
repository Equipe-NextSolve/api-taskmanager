import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import crypto from "crypto";
import { PLANS } from "../constants/plans";
import { z } from "zod";

const registerSchema = z.object({
    companyId: z.string().min(1).max(100),
    companyName: z.string().min(2).max(200),
    responsibleName: z.string().min(2).max(200),
    email: z.string().email(),
    plan: z.enum(["FREE", "BASIC", "PRO"]).default("FREE"),
});

export const publicRegister = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const secret = req.headers["x-registration-secret"];
    if (!secret || secret !== process.env.REGISTRATION_SECRET) {
        res.status(401).json({ error: "Não autorizado." });
        return;
    }

    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: "Dados inválidos.",
            details: result.error.flatten(),
        });
        return;
    }

    const { companyId, companyName, responsibleName, email, plan } =
        result.data;

    try {
        const existing = await prisma.tenant.findFirst({
            where: { OR: [{ email }, { companyId }] },
        });
        if (existing) {
            res.status(409).json({ error: "Empresa já cadastrada." });
            return;
        }

        if (!PLANS) {
            res.status(404).json({ error: "Planos não encontrados." });
            return;
        }

        const appKey = `ak_${crypto.randomBytes(16).toString("hex")}`;
        const privateKey = `pk_${crypto.randomBytes(32).toString("hex")}`;

        const selectedPlan = PLANS[plan];
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + selectedPlan.days);

        const tenant = await prisma.tenant.create({
            data: {
                companyId,
                companyName,
                responsibleName,
                email,
                appKey,
                privateKey,
                plan,
                expiresAt,
                logs: {
                    create: {
                        action: "TENANT_REGISTERED",
                        details: `Plano: ${plan}`,
                    },
                },
            },
        });

        res.status(201).json({
            appKey: tenant.appKey,
            plan: tenant.plan,
            expiresAt: tenant.expiresAt,
        });
    } catch (error) {
        console.error("[public] Erro ao registrar empresa:", error);
        res.status(500).json({ error: "Erro interno ao registrar." });
    }
};
