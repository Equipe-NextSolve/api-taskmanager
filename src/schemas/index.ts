import { z } from 'zod';

export const createTenantSchema = z.object({
  companyId: z.string().min(1).max(100),
  companyName: z.string().min(2).max(200),
  responsibleName: z.string().min(2).max(200),
  email: z.string().email(),
  plan: z.enum(['FREE', 'BASIC', 'PRO']).optional().default('FREE'),
  paymentMethod: z.string().optional(),
});

export const updateTenantSchema = z
  .object({
    companyName: z.string().min(2).max(200).optional(),
    responsibleName: z.string().min(2).max(200).optional(),
    plan: z.enum(['FREE', 'BASIC', 'PRO']).optional(),
    status: z.boolean().optional(),
    paymentMethod: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Ao menos um campo deve ser fornecido para atualização.',
  });

export const createSubscriptionSchema = z.object({
  plan: z.enum(['BASIC', 'PRO']),
});

export const createAsaasCustomerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  cpfCnpj: z.string().min(11).max(18),
  phone: z.string().optional(),
});