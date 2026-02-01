import path from "path";
import express from "express";
import cors from "cors";
import { SocialAiBotRoutes } from "./modules/socialAiBot/socialAiBot.route";

const app = express();

// ✅ static uploads (image/video public url)
// app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    etag: false,
    lastModified: false,
    cacheControl: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    },
  })
);



/**
 * ✅ CORS
 * - UI (Next.js) runs on http://localhost:3000
 * - Backend runs on http://localhost:5000
 */
app.use(
  cors({
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * ✅ Health check
 */
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

/**
 * Social AI Bot Routes
 */
app.use("/api/social-ai-bot", SocialAiBotRoutes);

export default app;
