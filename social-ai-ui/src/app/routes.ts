import express from "express";
import multer from "multer";
import path from "path";
import { SocialAiBotController } from "./socialAiBot.controller";

const router = express.Router();

const upload = multer({
  dest: path.join(process.cwd(), "uploads"),
});

/**
 * Facebook (and Instagram) Webhook Route
 * GET  -> Meta verify
 * POST -> Incoming messages/events
 */
router
  .route("/facebook/webhook")
  .get(SocialAiBotController.handleFacebookWebhook)
  .post(SocialAiBotController.handleFacebookWebhook);

/**
 * ✅ UI endpoints (DB history)
 */
router.get("/conversations", SocialAiBotController.getConversations);
router.get("/messages/:conversationId", SocialAiBotController.getMessagesByConversation);

/**
 * ✅ UI → Send message to customer
 */
router.post("/manual-reply", SocialAiBotController.manualReply);

/**
 * ✅ UI → Send image/video to customer
 */
router.post(
  "/manual-media-reply",
  upload.single("file"),
  SocialAiBotController.manualMediaReply
);

export const SocialAiBotRoutes = router;
