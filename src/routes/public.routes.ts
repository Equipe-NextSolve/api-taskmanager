import { Router } from 'express';
import { publicRegister } from '../controllers/public.controller';
import { rateLimit } from '../middlewares/rate-limit';

const router = Router();

router.post(
    '/register',
    rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'public-register' }),
    publicRegister
);


export default router;