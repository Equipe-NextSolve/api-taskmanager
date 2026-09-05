import { Router } from "express";
import { sendInviteEmail } from "../controllers/email.controller";
import { verifyInternalSecret } from "../middlewares/internal-auth";
import { emailRateLimit } from "../middlewares/rate-limit";

const router = Router();
router.post("/send-invite", emailRateLimit, verifyInternalSecret, sendInviteEmail);

export default router;