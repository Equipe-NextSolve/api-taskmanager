import { Router } from 'express';
import { verifyAppKey } from '../middlewares/billing-auth';
import {
    getBillingStatus,
    setupCustomer,
    createSubscription,
    cancelSubscription,
    cancelPendingAccount,
} from '../controllers/billing.controller';

const router = Router();

router.use(verifyAppKey);

router.get('/status', getBillingStatus);
router.post('/customer', setupCustomer);
router.post('/subscribe', createSubscription);
router.delete('/subscribe', cancelSubscription);
router.delete('/cancel-account', cancelPendingAccount);

export default router;