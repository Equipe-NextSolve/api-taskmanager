// src/controllers/admin.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

export const createTenant = async (req: Request, res: Response): Promise<void> => {
    try {
        const { 
            companyId, 
            companyName, 
            responsibleName, 
            email, 
            plan,
            paymentMethod 
        } = req.body;

        if (!companyId || !companyName || !responsibleName || !email) {
            res.status(400).json({ 
                error: 'Os campos companyId, companyName, responsibleName e email são obrigatórios.' 
            });
            return;
        }

        // Gera chaves únicas para o Tenant
        const appKey = `ak_${crypto.randomBytes(16).toString('hex')}`;
        const privateKey = `pk_${crypto.randomBytes(32).toString('hex')}`;

        // Define expiração padrão de 30 dias para novos testes/planos
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
            plan: plan || 'FREE',
            expiresAt,
            paymentMethod
        },
        });

        res.status(201).json({
        message: 'Tenant criado com sucesso!',
        tenant: {
            id: newTenant.id,
            companyName: newTenant.companyName,
            appKey: newTenant.appKey, // O cliente usará essa chave no frontend dele
            privateKey: newTenant.privateKey // O cliente usará essa chave no backend dele
        }
        });
    } catch (error) {
        console.error('Erro ao criar tenant:', error);
        res.status(500).json({ error: 'Erro interno ao criar o tenant.' });
    }
};