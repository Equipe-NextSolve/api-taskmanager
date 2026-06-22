// src/routes/admin.routes.ts
import { Router } from 'express';
import { createTenant } from '../controllers/admin.controller';
import { verifyAdminJWT } from '../middlewares/auth.proxy';

const router = Router();

// Rota protegida pelo JWT administrativo
router.post('/tenants', verifyAdminJWT, createTenant);

export default router;