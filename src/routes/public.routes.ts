import { Router } from 'express';
import { publicRegister } from '../controllers/public.controller';
import { rateLimit } from '../middlewares/rate-limit';

const router = Router();

router.post('/register', rateLimit, publicRegister);


export default router;