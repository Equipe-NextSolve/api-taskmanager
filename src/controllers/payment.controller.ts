// src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { PLANS } from '../constants/plans';

export const createAsaasSubscription = async (req: Request, res: Response): Promise<void> => {
    const { tenantId, plan } = req.body;
    const selectedPlan = PLANS[plan as keyof typeof PLANS] || PLANS.BASIC;
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant || !tenant.asaasCustomerId) {
      res.status(404).json({ error: 'Tenant ou Customer ID não encontrado.' });
      return;
    }

    // Chamada usando o fetch nativo do Node.js
    const response = await fetch('https://api.asaas.com/v3/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': process.env.ASAAS_API_KEY as string
      },
      body: JSON.stringify({
        customer: tenant.asaasCustomerId,
        billingType: 'PIX',
        value: selectedPlan.price,
        nextDueDate: new Date().toISOString().split('T')[0],
        cycle: 'MONTHLY'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }

    // Salvar o ID da assinatura no banco
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { asaasSubscriptionId: data.id }
    });

    res.status(201).json({ message: 'Assinatura criada!', subscriptionId: data.id });
  } catch (error) {
    console.error('Erro na integração Asaas:', error);
    res.status(500).json({ error: 'Erro ao criar assinatura no Asaas.' });
  }
};