import { Router } from 'express';
import { publicRegister } from '../controllers/public.controller';

const router = Router();

router.post('/register', publicRegister);

export default router;