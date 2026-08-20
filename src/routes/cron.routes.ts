import { Router } from "express";
import { syncExpiredTenants } from "../controllers/cron.controller";
import { verifyCronSecret } from "../middlewares/cron-auth";
import { cronRateLimit } from "../middlewares/rate-limit";

const router = Router();
router.post("/sync-expired", cronRateLimit, verifyCronSecret, syncExpiredTenants);

export default router;