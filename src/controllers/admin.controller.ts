import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import crypto from "crypto";
import { createTenantSchema, updateTenantSchema } from "../schemas/index";

export const createTenant = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const result = createTenantSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: "Dados inválidos.",
            details: result.error.flatten(),
        });
        return;
    }

    const {
        companyId,
        companyName,
        responsibleName,
        email,
        plan,
        paymentMethod,
    } = result.data;

    try {
        const existing = await prisma.tenant.findFirst({
            where: { OR: [{ email }, { companyId }] },
        });

        if (existing) {
            res.status(409).json({
                error: "Já existe um tenant com esse email ou companyId.",
            });
            return;
        }

        const appKey = `ak_${crypto.randomBytes(16).toString("hex")}`;
        const privateKey = `pk_${crypto.randomBytes(32).toString("hex")}`;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const newTenant = await prisma.tenant.create({
            data: {
                companyId,
                companyName,
                responsibleName,
                email,
                appKey,
                privateKey,
                plan: plan ?? "FREE",
                expiresAt,
                paymentMethod: paymentMethod ?? null,
                logs: {
                    create: {
                        action: "TENANT_CREATED",
                        details: `Plano inicial: ${plan ?? "FREE"}`,
                    },
                },
            },
        });

        res.status(201).json({
            message: "Tenant criado com sucesso!",
            tenant: {
                id: newTenant.id,
                companyName: newTenant.companyName,
                appKey: newTenant.appKey,
                privateKey: newTenant.privateKey,
                expiresAt: newTenant.expiresAt,
            },
        });
    } catch (error) {
        console.error("[admin] Erro ao criar tenant:", error);
        res.status(500).json({ error: "Erro interno ao criar o tenant." });
    }
};

export const listTenants = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const { page = "1", limit = "20", status, plan } = req.query;
        const pageNum = Math.max(1, parseInt(page as string));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            ...(status !== undefined && { status: status === "true" }),
            ...(plan && { plan: plan as string }),
        };

        const [tenants, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                skip,
                take: limitNum,
                select: {
                    id: true,
                    companyId: true,
                    companyName: true,
                    responsibleName: true,
                    email: true,
                    plan: true,
                    status: true,
                    expiresAt: true,
                    createdAt: true,
                    asaasCustomerId: true,
                    asaasSubscriptionId: true,
                },
                orderBy: { createdAt: "desc" },
            }),
            prisma.tenant.count({ where }),
        ]);

        res.json({
            data: tenants,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("[admin] Erro ao listar tenants:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};

export const getTenant = async (req: Request, res: Response): Promise<void> => {
    try {
        const rawId = req.params.id;

        if (!rawId || Array.isArray(rawId)) {
            res.status(400).json({ error: "ID inválido." });
            return;
        }

        const id = rawId;

        const tenant = await prisma.tenant.findUnique({
            where: { id },
            include: {
                logs: { orderBy: { createdAt: "desc" }, take: 20 },
            },
        });

        if (!tenant) {
            res.status(404).json({ error: "Tenant não encontrado." });
            return;
        }

        const { privateKey: _pk, ...safeResult } = tenant;
        res.json(safeResult);
    } catch (error) {
        console.error("[admin] Erro ao buscar tenant:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};

export const updateTenant = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const result = updateTenantSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            error: "Dados inválidos.",
            details: result.error.flatten(),
        });
        return;
    }

    try {
        const rawId = req.params.id;

        if (!rawId || Array.isArray(rawId)) {
            res.status(400).json({ error: "ID inválido." });
            return;
        }

        const id = rawId;

        const existing = await prisma.tenant.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: "Tenant não encontrado." });
            return;
        }

        const cleanData = Object.fromEntries(
            Object.entries(result.data).filter(
                ([_, value]) => value !== undefined,
            ),
        );

        const updated = await prisma.tenant.update({
            where: { id },
            data: {
                ...cleanData,
                logs: {
                    create: {
                        action: "TENANT_UPDATED",
                        details: JSON.stringify(result.data),
                    },
                },
            },
        });

        // Invalida cache da licença desse tenant
        await redis.del(`license:${existing.appKey}`).catch(() => {});

        const { privateKey: _pk, ...safeResult } = updated;
        res.json({ message: "Tenant atualizado.", tenant: safeResult });
    } catch (error) {
        console.error("[admin] Erro ao atualizar tenant:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};

export const deactivateTenant = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const rawId = req.params.id;

        if (!rawId || Array.isArray(rawId)) {
            res.status(400).json({ error: "ID inválido." });
            return;
        }

        const id = rawId;
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        if (!tenant) {
            res.status(404).json({ error: "Tenant não encontrado." });
            return;
        }

        await prisma.tenant.update({
            where: { id },
            data: {
                status: false,
                logs: { create: { action: "TENANT_DEACTIVATED" } },
            },
        });

        await redis.del(`license:${tenant.appKey}`).catch(() => {});
        res.json({ message: "Tenant desativado." });
    } catch (error) {
        console.error("[admin] Erro ao desativar tenant:", error);
        res.status(500).json({ error: "Erro interno." });
    }
};
