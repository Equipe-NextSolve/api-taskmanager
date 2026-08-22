import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import crypto, { timingSafeEqual } from "crypto";
import { PLANS } from "../constants/plans";
import { z } from "zod";

const registerSchema = z.object({
    companyId: z.string().min(1).max(100),
    companyName: z.string().min(2).max(200),
    responsibleName: z.string().min(2).max(200),
    email: z.string().email(),
    cpfCnpj: z.string().min(1, "CPF/CNPJ é obrigatório"),
    plan: z.enum(["FREE", "BASIC", "PRO"]).default("FREE"),
});

export const publicRegister = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const secret = req.headers["x-registration-secret"];
    const expected = process.env.REGISTRATION_SECRET ?? "";
    const isValid =
        typeof secret === "string" &&
        secret.length === expected.length &&
        timingSafeEqual(Buffer.from(secret), Buffer.from(expected));

    if (!isValid) {
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

    const { companyId, companyName, responsibleName, email, cpfCnpj, plan } =
        result.data;

    const rawCpfCnpj = cpfCnpj.replace(/\D/g, "");

    try {
        // Bloqueia e-mail ou companyId duplicado
        const existingByEmailOrId = await prisma.tenant.findFirst({
            where: { OR: [{ email }, { companyId }] },
        });
        if (existingByEmailOrId) {
            res.status(409).json({ error: "Empresa já cadastrada." });
            return;
        }

        // FREE só pode ser usado uma vez por CPF/CNPJ
        if (plan === "FREE") {
            const usedBefore = await prisma.tenant.findUnique({ where: { cpfCnpj: rawCpfCnpj } });
            if (usedBefore) {
                res.status(409).json({
                    error: "Este CPF/CNPJ já utilizou o período gratuito. Escolha um plano pago para continuar.",
                });
                return;
            }
        }

        // Para planos PAGOS
        if (plan !== "FREE") {
            const existingByCnpj = await prisma.tenant.findUnique({ where: { cpfCnpj: rawCpfCnpj } });
            if (existingByCnpj) {
                res.status(409).json({
                    error: "Este CPF/CNPJ já possui uma conta. Acesse sua conta e faça o upgrade via Configurações.",
                });
                return;
            }
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
                cpfCnpj: rawCpfCnpj,
                appKey,
                privateKey,
                plan,
                status: plan === "FREE",
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

export const checkCpfAvailability = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const secret = req.headers["x-registration-secret"];
    const expected = process.env.REGISTRATION_SECRET ?? "";
    const isValid =
        typeof secret === "string" &&
        secret.length === expected.length &&
        timingSafeEqual(Buffer.from(secret), Buffer.from(expected));

    if (!isValid) {
        res.status(401).json({ error: "Não autorizado." });
        return;
    }

    const schema = z.object({
        cpfCnpj: z.string().min(1),
        plan: z.enum(["FREE", "BASIC", "PRO"]).default("FREE"),
    });

    const result = schema.safeParse(req.query);
    if (!result.success) {
        res.status(400).json({ error: "Dados inválidos." });
        return;
    }

    const rawCpfCnpj = result.data.cpfCnpj.replace(/\D/g, "");

    try {
        const existing = await prisma.tenant.findUnique({ where: { cpfCnpj: rawCpfCnpj } });

        if (existing) {
            const message = result.data.plan === "FREE"
                ? "Este CPF/CNPJ já utilizou o período gratuito. Escolha um plano pago para continuar."
                : "Este CPF/CNPJ já possui uma conta. Acesse sua conta e faça o upgrade via Configurações.";
            res.json({ available: false, message });
            return;
        }

        res.json({ available: true });
    } catch (error) {
        console.error("[public] Erro ao checar CPF/CNPJ:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};