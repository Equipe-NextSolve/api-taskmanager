import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/validate/:appKey', async (req, res) => {
    const { appKey } = req.params;

    const tenant = await prisma.tenant.findUnique({
        where: { appKey }
    });

    if (!tenant) {
        res.status(404).json({ error: 'Licença não encontrada.' });
        return;
    }

    // Verifica se o status é true e se a data de expiração é maior que hoje
    const isExpired = new Date(tenant.expiresAt) < new Date();

    if (!tenant.status || isExpired) {
        res.status(403).json({ error: 'Licença expirada ou inativa.' });
        return;
    }

    res.status(200).json({ 
        message: 'Licença válida!', 
        tenant: tenant.companyName,
        expiresAt: tenant.expiresAt 
    });
});

export default router;