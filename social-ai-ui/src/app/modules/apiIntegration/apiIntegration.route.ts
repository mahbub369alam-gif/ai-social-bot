import express from "express";
import { requireAdminKey } from "../../middleware/auth";
import { ApiIntegrationController } from "./apiIntegration.controller";

const router = express.Router();

// ✅ For now: only Facebook works (IG/WhatsApp will be UI placeholder)
router.get("/facebook", requireAdminKey, ApiIntegrationController.getFacebook);
router.post("/facebook", requireAdminKey, ApiIntegrationController.saveFacebook);

export const ApiIntegrationRoutes = router;
