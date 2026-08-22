import { Router } from 'express';
import { publicRegister, checkCpfAvailability } from '../controllers/public.controller';
import { rateLimit } from '../middlewares/rate-limit';

const router = Router();

router.post(
    '/register',
    rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'public-register' }),
    publicRegister
);

router.get(
    '/check-availability',
    rateLimit({ windowSeconds: 60, max: 20, keyPrefix: 'check-availability' }),
    checkCpfAvailability
);

export default router;