import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { PLANS } from '../constants/plans';
import { z } from 'zod';

const setupCustomerSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    cpfCnpj: z.string().min(1),
    phone: z.string().optional(),
});

const createSubscriptionSchema = z.object({
    plan: z.string(),
    billingType: z.enum(['PIX', 'CREDIT_CARD']),
    creditCard: z.object({
        holderName: z.string(),
        number: z.string(),
        expiryMonth: z.string(),
        expiryYear: z.string(),
        ccv: z.string(),
    }).optional(),
    creditCardHolderInfo: z.object({
        name: z.string(),
        email: z.string().email(),
        cpfCnpj: z.string(),
        postalCode: z.string(),
        addressNumber: z.string(),
        phone: z.string().optional(),
    }).optional(),
});

async function asaasRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = process.env.ASAAS_ENV === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'access_token': process.env.ASAAS_API_KEY ?? '',
                ...((options.headers as Record<string, string>) ?? {}),
            },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error((err as any).errors?.[0]?.description ?? `Asaas error ${response.status}`);
        }
        return response.json() as Promise<T>;
    } catch (e) {
        clearTimeout(timeout);
        throw e;
    }
}

export async function getBillingStatus(req: Request, res: Response): Promise<void> {
    const tenant = (req as any).tenant;

    try {
        let pixInfo = null;

        if (tenant.asaasSubscriptionId && tenant.paymentMethod === 'PIX') {
            try {
                const payments = await asaasRequest<any>(
                    `/subscriptions/${tenant.asaasSubscriptionId}/payments?status=PENDING`
                );
                const pending = payments.data?.[0];
                if (pending) {
                    const qr = await asaasRequest<any>(`/payments/${pending.id}/pixQrCode`);
                    pixInfo = {
                        qrCode: qr.payload,
                        qrCodeImage: qr.encodedImage,
                        value: pending.value,
                        dueDate: pending.dueDate,
                    };
                }
            } catch { /* não bloqueia */ }
        }

        res.json({
            plan: tenant.plan,
            status: tenant.status,
            expiresAt: tenant.expiresAt,
            paymentMethod: tenant.paymentMethod,
            hasCustomer: !!tenant.asaasCustomerId,
            hasSubscription: !!tenant.asaasSubscriptionId,
            pixInfo,
        });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar status de cobrança.' });
    }
}

export async function setupCustomer(req: Request, res: Response): Promise<void> {
    const tenant = (req as any).tenant;

    if (tenant.asaasCustomerId) {
        res.json({ customerId: tenant.asaasCustomerId });
        return;
    }

    const parsed = setupCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Nome, e-mail e CPF/CNPJ são obrigatórios.' });
        return;
    }

    const { name, email, cpfCnpj, phone } = parsed.data;

    if (!name || !email || !cpfCnpj) {
        res.status(400).json({ error: 'Nome, e-mail e CPF/CNPJ são obrigatórios.' });
        return;
    }

    try {
        const customer = await asaasRequest<{ id: string }>('/customers', {
            method: 'POST',
            body: JSON.stringify({ name, email, cpfCnpj, mobilePhone: phone ?? undefined }),
        });

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: { asaasCustomerId: customer.id },
        });

        res.json({ customerId: customer.id });
    } catch (err: any) {
        res.status(400).json({ error: err.message ?? 'Erro ao configurar cliente Asaas.' });
    }
}

export async function createSubscription(req: Request, res: Response): Promise<void> {
    const tenant = (req as any).tenant;

    if (!tenant.asaasCustomerId) {
        res.status(400).json({ error: 'Configure os dados de pagamento antes de assinar.' });
        return;
    }

    if (tenant.asaasSubscriptionId) {
        res.status(400).json({ error: 'Já existe uma assinatura ativa.' });
        return;
    }

    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Dados de assinatura inválidos.', details: parsed.error.flatten() });
        return;
    }

    const { plan, billingType, creditCard, creditCardHolderInfo } = parsed.data;

    const planData = PLANS[plan as keyof typeof PLANS];
    if (!planData || plan === 'FREE' || plan === 'ADMIN') {
        res.status(400).json({ error: 'Plano inválido para assinatura.' });
        return;
    }

    if (billingType === 'CREDIT_CARD' && (!creditCard || !creditCardHolderInfo)) {
        res.status(400).json({ error: 'Dados do cartão são obrigatórios.' });
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        const payload: Record<string, unknown> = {
            customer: tenant.asaasCustomerId,
            billingType,
            cycle: 'MONTHLY',
            value: planData.price,
            nextDueDate: today,
            description: `Plano ${plan} - TaskManager`,
        };

        if (billingType === 'CREDIT_CARD') {
            payload.creditCard = creditCard;
            payload.creditCardHolderInfo = creditCardHolderInfo;
        }

        const subscription = await asaasRequest<{ id: string }>('/subscriptions', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: { asaasSubscriptionId: subscription.id, plan, paymentMethod: billingType },
        });

        let pixInfo = null;
        if (billingType === 'PIX') {
            try {
                const payments = await asaasRequest<any>(`/subscriptions/${subscription.id}/payments`);
                const first = payments.data?.[0];
                if (first) {
                    const qr = await asaasRequest<any>(`/payments/${first.id}/pixQrCode`);
                    pixInfo = {
                        qrCode: qr.payload,
                        qrCodeImage: qr.encodedImage,
                        value: first.value,
                        dueDate: first.dueDate,
                    };
                }
            } catch { /* não bloqueia */ }
        }

        res.json({ subscriptionId: subscription.id, pixInfo });
    } catch (err: any) {
        res.status(400).json({ error: err.message ?? 'Erro ao criar assinatura.' });
    }
}

export async function cancelSubscription(req: Request, res: Response): Promise<void> {
    const tenant = (req as any).tenant;

    if (!tenant.asaasSubscriptionId) {
        res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada.' });
        return;
    }

    try {
        await asaasRequest(`/subscriptions/${tenant.asaasSubscriptionId}`, { method: 'DELETE' });

        await prisma.tenant.update({
            where: { id: tenant.id },
            data: { asaasSubscriptionId: null },
        });

        res.json({ message: 'Assinatura cancelada com sucesso.' });
    } catch (err: any) {
        res.status(400).json({ error: err.message ?? 'Erro ao cancelar assinatura.' });
    }
}

export async function cancelPendingAccount(req: Request, res: Response): Promise<void> {
    const tenant = (req as any).tenant;

    if (tenant.firstPurchaseDate) {
        res.status(400).json({ error: 'Não é possível cancelar uma conta que já teve pagamento confirmado.' });
        return;
    }

    try {
        if (tenant.asaasSubscriptionId) {
            await asaasRequest(`/subscriptions/${tenant.asaasSubscriptionId}`, { method: 'DELETE' }).catch(() => {});
        }
        if (tenant.asaasCustomerId) {
            await asaasRequest(`/customers/${tenant.asaasCustomerId}`, { method: 'DELETE' }).catch(() => {});
        }

        await prisma.tenant.delete({ where: { id: tenant.id } });

        res.json({ message: 'Cadastro cancelado com sucesso.' });
    } catch (err: any) {
        res.status(500).json({ error: err.message ?? 'Erro ao cancelar cadastro.' });
    }
}