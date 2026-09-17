import { Router } from 'express';
import { verifyAppKey } from '../middlewares/billing-auth';
import {
    getBillingStatus,
    setupCustomer,
    createSubscription,
    cancelSubscription,
    cancelPendingAccount,
    tokenizeCard,
} from '../controllers/billing.controller';

const router = Router();

router.use(verifyAppKey);

router.get('/status', getBillingStatus);
router.post('/customer', setupCustomer);
router.post('/tokenize', tokenizeCard);
router.post('/subscribe', createSubscription);
router.delete('/subscribe', cancelSubscription);
router.delete('/cancel-account', cancelPendingAccount);

export default router;