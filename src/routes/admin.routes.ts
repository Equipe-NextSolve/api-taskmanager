import { Router } from 'express';
import { createTenant, listTenants, getTenant, updateTenant, deactivateTenant } from '../controllers/admin.controller';
import { createAsaasCustomer, createAsaasSubscription, cancelAsaasSubscription } from '../controllers/payment.controller';
import { verifyAdminJWT } from '../middlewares/auth.proxy';
import { adminRateLimit } from '../middlewares/rate-limit';

const router = Router();

// Todos os endpoints admin exigem JWT + rate limit
router.use(verifyAdminJWT, adminRateLimit);

// Tenant CRUD
router.get('/tenants',          listTenants);
router.post('/tenants',         createTenant);
router.get('/tenants/:id',      getTenant);
router.patch('/tenants/:id',    updateTenant);
router.delete('/tenants/:id',   deactivateTenant);

// Asaas
router.post('/tenants/:id/customer',      createAsaasCustomer);
router.post('/tenants/:id/subscription',  createAsaasSubscription);
router.delete('/tenants/:id/subscription', cancelAsaasSubscription);

export default router;