import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { PLANS } from "../constants/plans";
import {
    createAsaasCustomerSchema,
    createSubscriptionSchema,
} from "../schemas/index";

const ASAAS_BASE = "https://api.asaas.com/v3";

async function asaasRequest<T>(
    path: string,
    method: string,
    body?: unknown,
): Promise<T> {
    const res = await fetch(`${ASAAS_BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            access_token: process.env.ASAAS_API_KEY as string,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json()) as T;
    if (!res.ok) throw new Error(JSON.stringify(data));
    return data;
}

export const createAsaasCustomer = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const parsed = createAsaasCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "Dados inválidos.",
            details: parsed.error.flatten(),
        });
        return;
    }

    try {
        const rawId = req.params.id;

        if (!rawId || Array.isArray(rawId)) {
            res.status(400).json({ error: 'ID inválido.' });
            return;
        }

        const id = rawId
        const tenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!tenant) {
            res.status(404).json({ error: "Tenant não encontrado." });
            return;
        }

        if (tenant.asaasCustomerId) {
            res.status(409).json({
                error: "Tenant já possui cliente no Asaas.",
                asaasCustomerId: tenant.asaasCustomerId,
            });
            return;
        }

        const customer = await asaasRequest<{ id: string }>(
            "/customers",
            "POST",
            parsed.data,
        );

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                asaasCustomerId: customer.id,
                logs: {
                    create: {
                        action: "ASAAS_CUSTOMER_CREATED",
                        details: customer.id,
                    },
                },
            },
        });

        res.status(201).json({
            message: "Cliente criado no Asaas.",
            asaasCustomerId: customer.id,
        });
    } catch (error) {
        console.error("[payment] Erro ao criar cliente Asaas:", error);
        res.status(500).json({ error: "Erro ao criar cliente no Asaas." });
    }
};

export const createAsaasSubscription = async (
    req: Request,
    res: Response,
): Promise<void> => {
    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: "Dados inválidos.",
            details: parsed.error.flatten(),
        });
        return;
    }

    try {
        const rawId = req.params.id;

        if (!rawId || Array.isArray(rawId)) {
            res.status(400).json({ error: 'ID inválido.' });
            return;
        }

        const id = rawId

        const tenant = await prisma.tenant.findUnique({
            where: { id },
        });
        if (!tenant) {
            res.status(404).json({ error: "Tenant não encontrado." });
            return;
        }

        if (!tenant.asaasCustomerId) {
            res.status(400).json({
                error: "Crie o cliente no Asaas primeiro: POST /tenants/:id/customer",
            });
            return;
        }
        if (tenant.asaasSubscriptionId) {
            res.status(409).json({
                error: "Tenant já possui assinatura ativa.",
                subscriptionId: tenant.asaasSubscriptionId,
            });
            return;
        }

        const plan = PLANS[parsed.data.plan];
        const subscription = await asaasRequest<{ id: string }>(
            "/subscriptions",
            "POST",
            {
                customer: tenant.asaasCustomerId,
                billingType: "PIX",
                value: plan.price,
                nextDueDate: new Date().toISOString().split("T")[0],
                cycle: "MONTHLY",
                description: `Assinatura ${plan.name} - ${tenant.companyName}`,
            },
        );

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                asaasSubscriptionId: subscription.id,
                plan: parsed.data.plan,
                paymentMethod: "PIX",
                logs: {
                    create: {
                        action: "SUBSCRIPTION_CREATED",
                        details: `Plano: ${parsed.data.plan}, ID: ${subscription.id}`,
                    },
                },
            },
        });

        res.status(201).json({
            message: "Assinatura criada!",
            subscriptionId: subscription.id,
        });
    } catch (error) {
        console.error("[payment] Erro ao criar assinatura:", error);
        res.status(500).json({ error: "Erro ao criar assinatura no Asaas." });
    }
};

export const cancelAsaasSubscription = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const rawId = req.params.id;

        if (!rawId || Array.isArray(rawId)) {
            res.status(400).json({ error: 'ID inválido.' });
            return;
        }

        const id = rawId

        const tenant = await prisma.tenant.findUnique({
            where: { id },
        });
        if (!tenant) {
            res.status(404).json({ error: "Tenant não encontrado." });
            return;
        }

        if (!tenant.asaasSubscriptionId) {
            res.status(400).json({
                error: "Tenant não possui assinatura ativa.",
            });
            return;
        }

        await asaasRequest(
            `/subscriptions/${tenant.asaasSubscriptionId}`,
            "DELETE",
        );

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                asaasSubscriptionId: null,
                logs: { create: { action: "SUBSCRIPTION_CANCELLED" } },
            },
        });

        res.json({ message: "Assinatura cancelada." });
    } catch (error) {
        console.error("[payment] Erro ao cancelar assinatura:", error);
        res.status(500).json({ error: "Erro ao cancelar assinatura." });
    }
};
