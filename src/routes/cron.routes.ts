import { Router } from "express";
import { syncExpiredTenants } from "../controllers/cron.controller";
import { verifyCronSecret } from "../middlewares/cron-auth";

const router = Router();
router.post("/sync-expired", verifyCronSecret, syncExpiredTenants);

export default router;