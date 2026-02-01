// ===================== AUTO-GENERATED PATCH =====================
// This file replaces socialAiBot.controller.ts
// - Adds website-based product price answering from https://takesell.com.bd
// - Fixes req.user typing issues
// - Uses fetchFacebookUserProfile / fetchInstagramUserProfile
// ===============================================================

import { Request, Response } from "express";
import axios from "axios";
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import FormData from "form-data";
import OpenAI from "openai";
import { execResult, queryRows } from "../../../lib/mysql";
import { ensureConversationLock, getConversationAssignedSellerId, upsertConversationMeta } from "../seller/conversationLock.service";
import {
  fetchFacebookUserProfile,
  fetchInstagramUserProfile,
} from "./platforms/facebook.service";

// ---- TS FIX: Express Request does not know req.user in this codebase ----
type ReqUser = { id?: string; _id?: string; role?: string } & Record<string, any>;
const getReqUser = (req: Request): ReqUser => (((req as any).user || {}) as ReqUser);


/* ====================== SOCKET LIVE MSG TYPE ====================== */
type LiveMsg = {
  conversationId: string;
  customerName: string;
  customerProfilePic?: string;
  replyToMessageId?: string | number | null;
  sender: "customer" | "bot";
  senderRole?: "customer" | "admin" | "seller" | "ai";
  senderName?: string;
  message: string;
  platform: "facebook" | "instagram";
  pageId: string;
  timestamp: string;
};

// Build a human-friendly sender label for panel rendering.
// Keeps the existing `sender: customer|bot` contract intact while adding
// optional metadata.
const resolveBotActor = async (req: Request): Promise<{ senderRole: "admin" | "seller" | "ai"; senderName: string }> => {
  const role = String(getReqUser(req)?.role || "");

  if (role === "admin") {
    return { senderRole: "admin", senderName: "Admin" };
  }

  if (role === "seller") {
    const sid = String(getReqUser(req)?.id || "");
    let sellerName = "Seller";
    try {
      if (sid) {
        const rows = await queryRows<any[]>(
          "SELECT name,first_name,last_name,email FROM sellers WHERE id=? LIMIT 1",
          [sid]
        );
        const s = rows[0] || {};
        const n = safeString((s as any)?.name);
        const fn = safeString((s as any)?.first_name);
        const ln = safeString((s as any)?.last_name);
        const email = safeString((s as any)?.email);
        sellerName = (n || `${fn} ${ln}`.trim() || email || sellerName).trim();
      }
    } catch {
      // ignore
    }
    return { senderRole: "seller", senderName: sellerName || "Seller" };
  }

  // Default for auto-replies / system-generated bot messages
  return { senderRole: "ai", senderName: "AI Bot" };
};

/* ====================== SOCKET EMITTER ====================== */
const emitLiveMessage = (req: Request, payload: LiveMsg) => {
  const io = req.app.get("io");
  if (!io) return;

  getConversationAssignedSellerId(payload.conversationId)
    .then((sellerId) => {
      // ✅ Backward/forward compatible event names.
      // Old UI builds used "live_message", newer ones use "new_message".
      const emitTo = (room: string) => {
        io.to(room).emit("new_message", payload);
        io.to(room).emit("live_message", payload);
      };

      emitTo("admin");

      const sid = sellerId ? String(sellerId) : "";
      if (sid) emitTo(`seller:${sid}`);
      else emitTo("sellers");
    })
    .catch(() => {
      const emitTo = (room: string) => {
        io.to(room).emit("new_message", payload);
        io.to(room).emit("live_message", payload);
      };
      emitTo("admin");
      emitTo("sellers");
    });
};

/* ====================== HELPERS ====================== */
const normalizeText = (t: string) => (t || "").trim();

const safeString = (v: any) => {
  if (v === null || v === undefined) return "";
  return String(v);
};

const detectBangla = (text: string) => /[\u0980-\u09FF]/.test(text || "");

const lastErr = (e: any) => {
  try {
    return e?.response?.data || e?.message || e;
  } catch {
    return e;
  }
};

/* ====================== OPENAI CLIENT ====================== */
let _openaiClient: OpenAI | null = null;
const getOpenAIClient = () => {
  if (_openaiClient) return _openaiClient;

  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) throw new Error("OPENAI_API_KEY is missing in environment");

  _openaiClient = new OpenAI({ apiKey: key });
  return _openaiClient;
};

/* ====================== PAGE / IG TOKENS (FROM .env, NO HARDCODE) ====================== */
// Why this shape?
// - Avoid creating an "empty" key ("" -> "") when env vars are missing.
// - That bug makes token lookup silently fail and then name/profile_pic won't resolve.
const buildTokenMap = () => {
  const map: Record<string, string> = {};

  // ✅ FB #1 (new keys)
  const fb1 = String(process.env.PAGE_ID_FB_1 || "").trim();
  const fb1t = String(process.env.PAGE_TOKEN_FB_1 || "").trim();
  if (fb1 && fb1t) map[fb1] = fb1t;

  // ✅ FB #1 (compat keys)
  const fbLegacyId = String(process.env.FB_PAGE_ID || process.env.PAGE_ID || "").trim();
  const fbLegacyTok = String(process.env.FB_PAGE_ACCESS_TOKEN || process.env.PAGE_ACCESS_TOKEN || "").trim();
  if (fbLegacyId && fbLegacyTok && !map[fbLegacyId]) map[fbLegacyId] = fbLegacyTok;

  // ✅ FB #2 (new keys)
  const fb2 = String(process.env.PAGE_ID_FB_2 || "").trim();
  const fb2t = String(process.env.PAGE_TOKEN_FB_2 || "").trim();
  if (fb2 && fb2t) map[fb2] = fb2t;

  // IG (prefer IG_USER_ACCESS_TOKEN; fallback to IG_PAGE_TOKEN for backward compatibility)
  const ig = String(process.env.IG_BUSINESS_ID || "").trim();
  const igUserTok = String(process.env.IG_USER_ACCESS_TOKEN || "").trim();
  const igLegacyTok = String(process.env.IG_PAGE_TOKEN || "").trim();
  const igt = igUserTok || igLegacyTok;
  if (ig && igt) map[ig] = igt;

  return map;
};


const IG_BUSINESS_ID = String(process.env.IG_BUSINESS_ID || "").trim();

const getPageTokenByPageId = (pageId: string) => {
  const pid = String(pageId || "").trim();
  if (!pid) return "";
  // ✅ Always read latest env (API Integration UI can update runtime env without restart)
  const PAGE_TOKENS: Record<string, string> = buildTokenMap();
  const tok = String(PAGE_TOKENS[pid] || "").trim();
  // if (!tok) console.log("❌ Page token not found for pageId:", pid);
  return tok;
};

const isInstagramPage = (pageId: string) => {
  const pid = String(pageId || "").trim();
  return !!(pid && IG_BUSINESS_ID && pid === IG_BUSINESS_ID);
};

/* ====================== CONTEXT MEMORY (KEEP LIGHT) ====================== */
type ChatMessage = { role: "user" | "assistant"; content: string };
const conversationContext = new Map<string, ChatMessage[]>();
const MAX_CONTEXT_LENGTH = 5;

const pushContext = (
  conversationId: string,
  role: "user" | "assistant",
  content: string
) => {
  const ctx = conversationContext.get(conversationId) || [];
  ctx.push({ role, content });
  while (ctx.length > MAX_CONTEXT_LENGTH * 2) ctx.shift();
  conversationContext.set(conversationId, ctx);
};

/* ====================== DB HELPERS (MYSQL) ====================== */
type DbMessage = {
  id?: number;
  conversationId: string;
  customerName: string;
  customerProfilePic: string;
  sender: "customer" | "bot";
  senderRole: "customer" | "admin" | "seller" | "ai";
  senderName: string;
  message: string;
  replyToMessageId?: string | null;
  platform: "facebook" | "instagram";
  pageId: string;
  timestamp: Date;
};

const insertMessage = async (m: DbMessage) => {
  await execResult(
    `INSERT INTO social_chat_messages
      (conversation_id, customer_name, customer_profile_pic, sender, sender_role, sender_name, message, reply_to_message_id, platform, page_id, timestamp)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      m.conversationId,
      m.customerName,
      m.customerProfilePic,
      m.sender,
      m.senderRole,
      m.senderName,
      m.message,
      m.replyToMessageId || null,
      m.platform,
      m.pageId,
      m.timestamp,
    ]
  );
};

const enforceSellerConversationLock = async (conversationId: string, sellerId: string) => {
  const cid = String(conversationId || "").trim();
  const sid = String(sellerId || "").trim();
  if (!cid || !sid) throw new Error("conversationId/sellerId required");

  // If locked to someone else -> forbid
  const assigned = await getConversationAssignedSellerId(cid);
  if (assigned && assigned !== sid) {
    const err: any = new Error("Forbidden (conversation locked)");
    err.status = 403;
    throw err;
  }

  // If unassigned (no row OR seller_id NULL) -> claim it
  // 1) try insert (works if row doesn't exist)
  await execResult(
    "INSERT IGNORE INTO conversation_locks (conversation_id, seller_id, locked_at, assigned_at) VALUES (?,?,NOW(),NOW())",
    [cid, sid]
  );

  // 2) if exists but unassigned -> update
  const upd = await execResult(
    "UPDATE conversation_locks SET seller_id=?, assigned_at=NOW() WHERE conversation_id=? AND (seller_id IS NULL OR seller_id='')",
    [sid, cid]
  );

  if ((upd as any)?.affectedRows === 1) return;

  // 3) final check (someone else may have claimed)
  const again = await getConversationAssignedSellerId(cid);
  if (again && again !== sid) {
    const err: any = new Error("Forbidden (conversation locked)");
    err.status = 403;
    throw err;
  }
};

const getMessagesByConversationDb = async (conversationId: string) => {
  return queryRows<any[]>(
    "SELECT id, conversation_id AS conversationId, customer_name AS customerName, customer_profile_pic AS customerProfilePic, sender, sender_role AS senderRole, sender_name AS senderName, message, reply_to_message_id AS replyToMessageId, platform, page_id AS pageId, timestamp FROM social_chat_messages WHERE conversation_id=? ORDER BY timestamp ASC LIMIT 500",
    [conversationId]
  );
};

const getLatestConversationsDb = async (role: string, sellerId: string | null) => {
  const params: any[] = [];
  let extraWhere = "";
  if (role === "seller") {
    extraWhere = " AND (l.seller_id IS NULL OR l.seller_id = ?)";
    params.push(String(sellerId || ""));
  }

  const finalSql = `
    SELECT
      t.conversationId,
      t.customerName,
      t.customerProfilePic,
      t.platform,
      t.pageId,
      t.lastMessage,
      t.lastTime,
      l.seller_id AS assignedSellerId,
      l.delivery_status AS deliveryStatus,
      l.assigned_at AS assignedAt
    FROM (
      SELECT
        conversation_id AS conversationId,
        customer_name AS customerName,
        customer_profile_pic AS customerProfilePic,
        platform,
        page_id AS pageId,
        message AS lastMessage,
        timestamp AS lastTime,
        ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY timestamp DESC) AS rn
      FROM social_chat_messages
    ) t
    LEFT JOIN conversation_locks l ON l.conversation_id = t.conversationId
    WHERE t.rn = 1${extraWhere}
    ORDER BY t.lastTime DESC
    LIMIT 200
  `;

  const rows = await queryRows<any[]>(finalSql, params);
  return rows.map((r) => ({
    conversationId: r.conversationId,
    customerName: r.customerName,
    customerProfilePic: r.customerProfilePic,
    platform: r.platform,
    pageId: r.pageId,
    lastMessage: r.lastMessage,
    lastTime: r.lastTime,
    assignedSellerId: r.assignedSellerId || null,
    deliveryStatus: r.deliveryStatus || "confirmed",
    assignedAt: r.assignedAt || null,
  }));
};

/* ====================== SYSTEM PROMPT ====================== */
const SYSTEM_PROMPT = `
You are a customer support assistant for "Takesell".

Rules:
- Always reply in the SAME language as the user (Bangla or English)
- Be polite, professional, and short (1–2 lines only)
- Do NOT give unnecessary information

Business behavior:
- We provide custom sofa covers, pillow covers, and chair covers
- Cash on Delivery is available all over Bangladesh
- First, ask the customer to send a product photo
- If the customer sends a photo/image, reply exactly:
  "ধন্যবাদ! ছবিটা পেয়েছি দয়া করে আপনার whatsapp নাম্বার দিন, আমাদের একজন প্রতিনিধি শিগ্রই আপনার সাথে যোগাযোগ করবে।"

- If the customer wants to place an order, ask for:
  • Name
  • Full address
  • Phone number
- After collecting order details, say:
  "Our representative will contact you shortly. Thank you."
`;

/* ====================== EXCEL PRODUCTS (KEEP YOUR WAY) ====================== */
type Product = { product_type: string; size: string; price: number };

let PRODUCTS: Product[] = [];
try {
  const workbookPath = path.join(__dirname, "products.xlsx");
  const workbook = XLSX.readFile(workbookPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  PRODUCTS = XLSX.utils.sheet_to_json(sheet);
} catch {
  PRODUCTS = [];
}

const findPrice = (type: string, size: string) => {
  return PRODUCTS.find(
    (p) =>
      String(p.product_type || "").toLowerCase() ===
        String(type || "").toLowerCase() &&
      String(p.size || "").toLowerCase() === String(size || "").toLowerCase()
  );
};

const buildMessages = (conversationId: string, text: string) => {
  const ctx = conversationContext.get(conversationId) || [];
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "assistant",
      content:
        "Reply rules: keep reply within 1–2 short lines, complete sentence, end with a clear question/instruction.",
    },
    ...ctx,
    { role: "user", content: text },
  ];
};

/* ====================== SEND MESSAGE HELPERS ====================== */

/**
 * Treat Meta CDN URLs (fbcdn/scontent) as media as well.
 * We persist remote media into our own /uploads so:
 * - Admin/Seller panel renders reliably
 * - Forwarding / manual sending can send true attachments (not plain links)
 */
const isHttpUrl = (u: string) => /^https?:\/\//i.test((u || "").trim());

const guessExtFromContentType = (ct: string): string => {
  const t = (ct || "").split(";")[0].trim().toLowerCase();
  if (t === "image/jpeg") return ".jpg";
  if (t === "image/jpg") return ".jpg";
  if (t === "image/png") return ".png";
  if (t === "image/gif") return ".gif";
  if (t === "image/webp") return ".webp";
  if (t === "video/mp4") return ".mp4";
  if (t === "video/quicktime") return ".mov";
  if (t === "application/pdf") return ".pdf";
  return "";
};

const guessExtFromUrl = (u: string): string => {
  try {
    const pathname = new URL(u).pathname || "";
    const ext = path.extname(pathname);
    if (ext && ext.length <= 6) return ext;
  } catch {}
  return "";
};


const guessMimeFromUrl = (u: string): string => {
  const ext = guessExtFromUrl(u).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".m4v") return "video/mp4";
  if (ext === ".pdf") return "application/pdf";
  // generic fallbacks
  return "";
};

const fetchRemoteContentType = async (url: string): Promise<string> => {
  try {
    const resp = await axios.head(url, {
      maxRedirects: 5,
      timeout: 4000,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const ct = String((resp.headers as any)?.["content-type"] || "").split(";")[0].trim();
    return ct;
  } catch {
    return "";
  }
};


const downloadRemoteMediaToUploads = async (remoteUrl: string): Promise<string | null> => {
  try {
    if (!isHttpUrl(remoteUrl)) return null;

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const resp = await axios.get(remoteUrl, {
      responseType: "stream",
      timeout: 20000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
      validateStatus: (s) => s >= 200 && s < 300,
      headers: {
        // Some CDNs require UA
        "User-Agent": "Mozilla/5.0",
      },
    });

    const ct = String(resp.headers?.["content-type"] || "");
    const ext = guessExtFromContentType(ct) || guessExtFromUrl(remoteUrl) || ".jpg";

    const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    const abs = path.join(uploadsDir, filename);

    await new Promise<void>((resolve, reject) => {
      const w = fs.createWriteStream(abs);
      resp.data.pipe(w);
      w.on("finish", () => resolve());
      w.on("error", (e) => reject(e));
    });

    return `/uploads/${filename}`;
  } catch (e) {
    console.log("downloadRemoteMediaToUploads failed:", (e as any)?.message || e);
    return null;
  }
};


const sendFacebookMessage = async (psid: string, text: string, token: string) => {
  await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
    messaging_type: "RESPONSE",
    recipient: { id: psid },
    message: { text },
  });
};

/**
 * ✅ Facebook Messaging: upload binary to get attachment_id (avoids public URL fetch issues)
 * - Step 1: POST /me/message_attachments -> attachment_id
 * - Step 2: POST /me/messages with attachment_id
 */
const uploadFacebookAttachment = async (
  type: "image" | "video" | "file",
  filePath: string,
  mimetype: string,
  token: string
): Promise<string> => {
  const form = new FormData();

  form.append(
    "message",
    JSON.stringify({
      attachment: {
        type,
        payload: { is_reusable: true },
      },
    })
  );

  // Meta expects the field name "filedata"
  form.append("filedata", fs.createReadStream(filePath), {
    contentType: mimetype || "application/octet-stream",
    filename: path.basename(filePath),
  } as any);

  const r = await axios.post(
    `https://graph.facebook.com/v19.0/me/message_attachments?access_token=${token}`,
    form,
    { headers: form.getHeaders() }
  );

  const attachmentId = String((r as any)?.data?.attachment_id || "").trim();
  if (!attachmentId) throw new Error("Meta upload did not return attachment_id");
  return attachmentId;
};

const sendFacebookAttachmentById = async (
  psid: string,
  type: "image" | "video" | "file",
  attachmentId: string,
  token: string
) => {
  await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
    messaging_type: "RESPONSE",
    recipient: { id: psid },
    message: {
      attachment: {
        type,
        payload: { attachment_id: attachmentId },
      },
    },
  });
};


const sendFacebookAttachmentByUrl = async (
  psid: string,
  type: "image" | "video" | "file",
  url: string,
  token: string
) => {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) throw new Error("Missing media url");
  await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
    messaging_type: "RESPONSE",
    recipient: { id: psid },
    message: {
      attachment: {
        type,
        payload: { url: safeUrl, is_reusable: false },
      },
    },
  });
};


const sendInstagramMessage = async (
  igBusinessId: string,
  psid: string,
  text: string,
  token: string
) => {
  await axios.post(
    `https://graph.facebook.com/v19.0/${igBusinessId}/messages?access_token=${token}`,
    {
      recipient: { id: psid },
      message: { text },
    }
  );
};

const sendInstagramAttachment = async (
  igBusinessId: string,
  psid: string,
  type: "image" | "video" | "file",
  url: string,
  token: string
) => {
  // IG Messaging API supports attachments similar to FB.
  // If Meta changes the exact schema, we'll see it as a send error in logs.
  await axios.post(
    `https://graph.facebook.com/v19.0/${igBusinessId}/messages?access_token=${token}`,
    {
      recipient: { id: psid },
      message: {
        attachment: {
          type,
          payload: { url },
        },
      },
    }
  );
};

const isVideoFile = (filename: string, mime?: string) => {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("video/")) return true;
  return /\.(mp4|mov|webm|avi|mkv)$/i.test(filename || "");
};

const isImageFile = (filename: string, mime?: string) => {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(filename || "");
};

const getPublicBaseUrl = (req: Request) => {
  const envBase = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  return `${proto}://${host}`.replace(/\/$/, "");
};

/* ====================== PROFILE RESOLVE (DO NOT OVERWRITE GOOD DATA) ====================== */
const fetchGraphProfileFallback = async (
  senderId: string,
  pageToken: string
): Promise<{ name?: string; profilePic?: string } | null> => {
  try {
    if (!senderId || !pageToken) return null;

    // Works for Facebook Messenger PSID in many cases.
    // For IG, this may work depending on the event/account type; if it fails we just return null.
    const url = `https://graph.facebook.com/v18.0/${encodeURIComponent(senderId)}`;
    const { data } = await axios.get(url, {
      params: {
        fields: "name,profile_pic",
        access_token: pageToken,
      },
      timeout: 10000,
    });

    return {
      name: data?.name,
      profilePic: data?.profile_pic,
    };
  } catch {
    return null;
  }
};

const looksLikeId = (v: string) => {
  const s = String(v || "").trim();
  if (!s) return true;
  // common patterns: numeric ids, long tokens, psid-like strings
  if (/^\d{6,}$/.test(s)) return true;
  if (s.length >= 16 && !/[a-zA-Z]/.test(s)) return true;
  return false;
};

const resolveCustomerIdentity = async (
  conversationId: string,
  senderId: string,
  pageId: string,
  pageToken: string
) => {
  // 1) start with last known in DB (so we don't regress to ID)
  const lastRows = await queryRows<any[]>(
    "SELECT customer_name, customer_profile_pic FROM social_chat_messages WHERE conversation_id=? ORDER BY timestamp DESC LIMIT 1",
    [conversationId]
  );
  const last = lastRows[0] || null;

  let customerName = safeString((last as any)?.customer_name) || senderId;
  let customerProfilePic = safeString((last as any)?.customer_profile_pic) || "";

  // 2) try fresh fetch via helper services
  try {
    if (pageToken && senderId) {
      if (isInstagramPage(pageId)) {
        const prof = await fetchInstagramUserProfile(senderId, pageToken);
        customerName = (prof as any)?.name || customerName;
        customerProfilePic = (prof as any)?.profilePic || customerProfilePic;
      } else {
        const prof = await fetchFacebookUserProfile(senderId, pageToken);
        customerName = (prof as any)?.name || customerName;
        customerProfilePic = (prof as any)?.profilePic || customerProfilePic;
      }
    }
  } catch {
    // ignore; keep fallback flow below
  }

  // 3) strong fallback: direct Graph API fetch (prevents showing raw ID)
  if ((looksLikeId(customerName) || customerName === senderId) && pageToken && senderId) {
    const gp = await fetchGraphProfileFallback(senderId, pageToken);
    if (gp?.name) customerName = gp.name;
    if (gp?.profilePic) customerProfilePic = gp.profilePic;
  }

  // 4) final fallback: do not show raw ID in UI
  if (looksLikeId(customerName) || customerName === senderId) {
    customerName = "Customer";
  }

  return { customerName, customerProfilePic };
};


/* ====================== PROFILE: REFRESH META ON READ (FOR OLD ROWS) ====================== */
const updateConversationCustomerMeta = async (
  conversationId: string,
  customerName: string,
  customerProfilePic: string
) => {
  // Keep identity consistent across the conversation history (customer messages).
  await execResult(
    "UPDATE social_chat_messages SET customer_name=?, customer_profile_pic=? WHERE conversation_id=? AND sender='customer'",
    [customerName, customerProfilePic, conversationId]
  );
};

const refreshIdentityIfNeeded = async (conversationId: string, rows: any[]) => {
  if (!rows?.length) return { rows, changed: false };

  // Use the latest row to determine pageId/platform context.
  const last = rows[rows.length - 1];
  const pageId = safeString(last?.pageId);
  const pageToken = getPageTokenByPageId(pageId);

  // In this project, conversationId is the scoped sender id (PSID / IG scoped id).
  const senderId = String(conversationId || "").trim();

  const currentName = safeString(last?.customerName);
  const currentPic = safeString(last?.customerProfilePic);

  if (!pageToken) return { rows, changed: false };

  // If name already looks fine and not equal to raw id, do nothing.
  if (!looksLikeId(currentName) && currentName !== senderId && currentName !== "Customer") {
    return { rows, changed: false };
  }

  const { customerName, customerProfilePic } = await resolveCustomerIdentity(
    conversationId,
    senderId,
    pageId,
    pageToken
  );

  // If still generic, don't spam DB updates.
  if (!customerName || customerName === "Customer") return { rows, changed: false };

  await updateConversationCustomerMeta(conversationId, customerName, customerProfilePic || currentPic);

  const patched = rows.map((r) => ({
    ...r,
    customerName,
    customerProfilePic: customerProfilePic || currentPic,
  }));

  return { rows: patched, changed: true };
};

const refreshConversationListIdentity = async (items: any[]) => {
  // Light-touch refresh: only a few items that still look like IDs.
  const maxRefresh = 25;
  let done = 0;

  for (const it of items || []) {
    if (done >= maxRefresh) break;

    const conversationId = String(it?.conversationId || "").trim();
    const pageId = safeString(it?.pageId);
    const pageToken = getPageTokenByPageId(pageId);
    if (!conversationId || !pageToken) continue;

    const currentName = safeString(it?.customerName);
    const senderId = conversationId;

    if (!looksLikeId(currentName) && currentName !== senderId && currentName !== "Customer") continue;

    try {
      const { customerName, customerProfilePic } = await resolveCustomerIdentity(
        conversationId,
        senderId,
        pageId,
        pageToken
      );

      if (!customerName || customerName === "Customer") continue;

      await updateConversationCustomerMeta(conversationId, customerName, customerProfilePic || "");

      it.customerName = customerName;
      it.customerProfilePic = customerProfilePic || it.customerProfilePic;
      done += 1;
    } catch {
      // ignore one-off failures; keep list loading fast
    }
  }

  return items;
};



/* ====================== API: GET CONVERSATIONS ====================== */
const getConversations = async (req: Request, res: Response) => {
  try {
    const role = getReqUser(req)?.role || "seller";
    const sellerId = role === "seller" ? String(getReqUser(req)?.id || "") : null;
    const items = await getLatestConversationsDb(String(role), sellerId);
    await refreshConversationListIdentity(items);
    return res.json(items);
  } catch (e) {
    console.error("getConversations error:", e);
    return res.status(500).json({ message: "Failed to load conversations" });
  }
};

/* ====================== API: GET MESSAGES BY CONVERSATION ====================== */
const getMessagesByConversation = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    if (getReqUser(req)?.role === "seller") {
      const assigned = await getConversationAssignedSellerId(conversationId);
      if (assigned && String(assigned) !== String(getReqUser(req)?.id)) {
        return res.status(403).json({ message: "Forbidden (conversation locked)" });
      }
    }

    const rows = await getMessagesByConversationDb(conversationId);
    const refreshed = await refreshIdentityIfNeeded(conversationId, rows);

    return res.json(refreshed.rows);
  } catch (e) {
    console.error("getMessagesByConversation error:", e);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

/* ====================== ADMIN: ASSIGN / UNASSIGN + DELIVERY STATUS ====================== */
const updateConversationMeta = async (req: Request, res: Response) => {
  try {
    const role = String(getReqUser(req)?.role || "");

    const conversationId = safeString(req.params.conversationId);
    if (!conversationId) return res.status(400).json({ message: "conversationId required" });

    const rawSellerId = (req.body as any)?.sellerId;
    const rawStatus = safeString((req.body as any)?.deliveryStatus);

    // 🔐 Role-based permissions:
    // - Admin: may assign/unassign ONLY
    // - Seller: may update deliveryStatus ONLY

    let nextSellerId: string | null | undefined = undefined;
    let nextStatus: "confirmed" | "hold" | "cancel" | "delivered" | undefined = undefined;

    // ADMIN assignment
    if (rawSellerId !== undefined) {
      if (role !== "admin") return res.status(403).json({ message: "Forbidden" });
      if (rawSellerId === null || rawSellerId === "" || rawSellerId === "unassign") {
        nextSellerId = null;
      } else {
        const sellerIdStr = String(rawSellerId || "").trim();
        if (!sellerIdStr) return res.status(400).json({ message: "Invalid sellerId" });
        const exists = await queryRows<any[]>("SELECT id FROM sellers WHERE id=? LIMIT 1", [sellerIdStr]);
        if (!exists.length) return res.status(404).json({ message: "Seller not found" });
        nextSellerId = sellerIdStr;
      }
    }

    // SELLER status update
    if (rawStatus) {
      if (role !== "seller") return res.status(403).json({ message: "Forbidden" });
      const allowed = ["confirmed", "hold", "cancel", "delivered"] as const;
      if (!(allowed as readonly string[]).includes(rawStatus)) {
        return res.status(400).json({ message: "Invalid deliveryStatus" });
      }
      const me = String(getReqUser(req)?.id || "");
      if (!me) return res.status(403).json({ message: "Forbidden" });
      const assigned = await getConversationAssignedSellerId(conversationId);
      if (assigned && assigned !== me) return res.status(403).json({ message: "Forbidden" });
      nextStatus = rawStatus as any;
    }

    if (nextSellerId === undefined && nextStatus === undefined) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    // previous
    const prevRows = await queryRows<any[]>(
      "SELECT seller_id, delivery_status FROM conversation_locks WHERE conversation_id=? LIMIT 1",
      [conversationId]
    );
    const prev = prevRows[0] || {};

    const doc = await upsertConversationMeta({
      conversationId,
      sellerId: nextSellerId,
      deliveryStatus: nextStatus,
      assignedBy: role === "admin" ? "admin" : undefined,
    });

    // 🔔 notify UIs (admin + affected sellers) so lists can update immediately
    try {
      const io = req.app.get("io");
      if (io) {
        const payload = {
          conversationId,
          assignedSellerId: doc.assignedSellerId,
          deliveryStatus: doc.deliveryStatus,
          assignedAt: doc.assignedAt,
        };

        io.to("admin").emit("conversation_meta", payload);

        const prevSellerId = prev?.seller_id ? String(prev.seller_id) : "";
        const newSellerId = doc.assignedSellerId ? String(doc.assignedSellerId) : "";

        // notify both old and new owners (so old owner can remove it, new owner can add)
        if (prevSellerId) io.to(`seller:${prevSellerId}`).emit("conversation_meta", payload);
        if (newSellerId) io.to(`seller:${newSellerId}`).emit("conversation_meta", payload);

        // unassigned conversations are visible to all sellers
        if (!newSellerId) io.to("sellers").emit("conversation_meta", payload);
      }
    } catch {
      // ignore socket errors
    }

    return res.json({
      conversationId,
      assignedSellerId: doc.assignedSellerId,
      deliveryStatus: doc.deliveryStatus,
      assignedAt: doc.assignedAt,
    });
  } catch (e) {
    console.error("updateConversationMeta error:", e);
    return res.status(500).json({ message: "Failed to update" });
  }
};

/* ====================== WEBHOOK HANDLER ====================== */
const handleFacebookWebhook = async (req: Request, res: Response) => {
  try {
    // verify (GET)
    if (req.method === "GET") {
      if (
        req.query["hub.mode"] === "subscribe" &&
        req.query["hub.verify_token"] === process.env.WEBHOOK_VERIFY_TOKEN
      ) {
        return res.status(200).send(req.query["hub.challenge"]);
      }
      return res.sendStatus(403);
    }

    const entries: any[] = Array.isArray(req.body?.entry) ? req.body.entry : [];
    if (!entries.length) return res.send("EVENT_RECEIVED");

    // ✅ Meta can batch multiple entries/messages in a single webhook call.
    // Old code only processed entry[0] + messaging[0], which caused messages
    // to not show in UI and bot replies to not trigger.
    for (const entry of entries) {
      const pageId = safeString(entry?.id);
      const pageToken = getPageTokenByPageId(pageId);

      if (!pageId || !pageToken) {
        console.log("❌ Unknown Page/IG ID or missing token:", pageId);
        continue;
      }

      const platform: "facebook" | "instagram" = isInstagramPage(pageId)
        ? "instagram"
        : "facebook";

      /* ====================== FACEBOOK ====================== */
      if (Array.isArray(entry.messaging) && entry.messaging.length) {
        for (const msg of entry.messaging) {
          const isEcho = !!msg?.message?.is_echo;

          // ids
          const senderId = safeString(msg?.sender?.id);
          const recipientId = safeString(msg?.recipient?.id);

          // normal: sender=customer, recipient=page
          // echo: sender=page, recipient=customer
          const customerId = isEcho ? recipientId : senderId;
          if (!customerId) continue;

          const conversationId = `${pageId}_${customerId}`;

          // text + attachments
          let storedText = normalizeText(msg?.message?.text || "");
          let attachmentUrl = "";

          const atts = msg?.message?.attachments || [];
          const rawUrls = atts.map((a: any) => a?.payload?.url).filter(Boolean);

          if (rawUrls.length > 0) {
            const firstType = safeString(atts?.[0]?.type).toLowerCase();

            // ✅ Persist Meta CDN URLs into our own /uploads for reliable rendering + forwarding
            const persistedUrls: string[] = [];
            for (const u of rawUrls) {
              const saved = await downloadRemoteMediaToUploads(String(u));
              persistedUrls.push(saved || String(u));
            }

            attachmentUrl = persistedUrls[0] || "";

            // Store as plain URLs (one per line). Frontend + forwarding treat /uploads/... as media.
            // (No "📷 Image:" prefix; that prefix caused forwarding to treat it as plain text link.)
            storedText = persistedUrls.join("\n");

            // If it was a video/file, keep the same storage format (URLs) — UI can decide rendering by extension.
            // We intentionally avoid emoji prefixes here.
            void firstType;
          }
          if (!storedText) continue;

          const { customerName, customerProfilePic } = await resolveCustomerIdentity(
            conversationId,
            customerId,
            pageId,
            pageToken
          );

          const ts = new Date();
          await insertMessage({
            conversationId,
            customerName,
            customerProfilePic,
            sender: isEcho ? "bot" : "customer",
            senderRole: isEcho ? "ai" : "customer",
            senderName: isEcho ? "AI Bot" : customerName,
            message: storedText,
            platform,
            pageId,
            timestamp: ts,
          });

          emitLiveMessage(req, {
            conversationId,
            customerName,
            customerProfilePic,
            sender: isEcho ? "bot" : "customer",
            senderRole: isEcho ? "ai" : "customer",
            senderName: isEcho ? "AI Bot" : customerName,
            message: storedText,
            platform,
            pageId,
            timestamp: ts.toISOString(),
          });

          // echo হলে AI reply দেব না
          if (isEcho) continue;

          /* ====================== REPLY LOGIC ====================== */
          let reply = detectBangla(storedText)
            ? "ধন্যবাদ! অনুগ্রহ করে আপনার প্রোডাক্টের ছবি দিন 😊"
            : "Thanks! Please send a photo of your product 😊";

          let skipAI = false;

          // fixed reply if media
          if (attachmentUrl) {
            reply =
              "ধন্যবাদ! ছবিটা পেয়েছি দয়া করে আপনার whatsapp নাম্বার দিন, আমাদের একজন প্রতিনিধি শিগ্রই আপনার সাথে যোগাযোগ করবে।";
            skipAI = true;
          }

          // price check (type + size)
          if (!skipAI) {
            const parts = storedText.trim().split(/\s+/);
            if (parts.length >= 2) {
              const product = findPrice(parts[0], parts[1]);
              if (product) {
                reply = `আপনার প্রোডাক্টের দাম: ${product.price} টাকা। অনুগ্রহ করে ছবি পাঠান।`;
                skipAI = true;
              }
            }
          }

          if (!skipAI) {
            try {
              const openai = getOpenAIClient();
              const chat = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: buildMessages(conversationId, storedText) as any,
                temperature: 0.4,
                max_tokens: 300,
                top_p: 0.9,
                frequency_penalty: 0.2,
                presence_penalty: 0.0,
              });
              reply = chat.choices?.[0]?.message?.content || reply;
            } catch (e) {
              console.error("OPENAI ERROR:", lastErr(e));
            }
          }

          pushContext(conversationId, "user", storedText);
          pushContext(conversationId, "assistant", reply);

          try {
            await sendFacebookMessage(customerId, reply, pageToken);
          } catch (e) {
            console.error("FB SEND ERROR:", lastErr(e));
          }

          const ts2 = new Date();
          await insertMessage({
            conversationId,
            customerName,
            customerProfilePic,
            sender: "bot",
            senderRole: "ai",
            senderName: "AI Bot",
            message: reply,
            platform,
            pageId,
            timestamp: ts2,
          });

          emitLiveMessage(req, {
            conversationId,
            customerName,
            customerProfilePic,
            sender: "bot",
            senderRole: "ai",
            senderName: "AI Bot",
            message: reply,
            platform,
            pageId,
            timestamp: ts2.toISOString(),
          });
        }
      }

      /* ====================== INSTAGRAM ====================== */
      if (Array.isArray(entry.changes) && entry.changes.length) {
        // IG webhooks can contain multiple changes, each may contain multiple messages
        for (const change of entry.changes) {
          const value = change?.value;
          const msgs: any[] = Array.isArray(value?.messages) ? value.messages : [];
          for (const msg of msgs) {
            const senderId = safeString(msg?.from?.id);
            if (!senderId) continue;

            // IG can send text OR attachments
            let text = normalizeText(msg?.text || "");
            let attachmentUrl = "";
            let attachmentType: "image" | "video" | "file" | "" = "";

            const atts = (msg as any)?.attachments || [];
            const urls = atts.map((a: any) => a?.payload?.url).filter(Boolean);
            if (!text && urls.length > 0) {
              const firstType = safeString(atts?.[0]?.type).toLowerCase();
              if (firstType === "video") {
                attachmentType = "video";
                attachmentUrl = urls[0];
                text = `🎥 Video: ${attachmentUrl}`;
              } else {
                attachmentType = "image";
                attachmentUrl = urls[0];
                text = urls.length > 1
                  ? `📷 Images:\n${urls.join("\n")}`
                  : `📷 Image: ${attachmentUrl}`;
              }
            }

            if (!text) continue;

            const conversationId = `${pageId}_${senderId}`;

            const { customerName, customerProfilePic } = await resolveCustomerIdentity(
              conversationId,
              senderId,
              pageId,
              pageToken
            );

            const ts = new Date();
            await insertMessage({
              conversationId,
              customerName,
              customerProfilePic,
              sender: "customer",
              senderRole: "customer",
              senderName: customerName,
              message: text,
              platform: "instagram",
              pageId,
              timestamp: ts,
            });

            emitLiveMessage(req, {
              conversationId,
              customerName,
              customerProfilePic,
              sender: "customer",
              senderRole: "customer",
              senderName: customerName,
              message: text,
              platform: "instagram",
              pageId,
              timestamp: ts.toISOString(),
            });

            // basic AI reply
            let reply = "ধন্যবাদ! অনুগ্রহ করে আপনার প্রোডাক্টের ছবি দিন 😊";

            // fixed reply if image/video
            let skipAI = false;
            if (attachmentUrl && (attachmentType === "image" || attachmentType === "video")) {
              reply =
                "ধন্যবাদ! ছবিটা পেয়েছি দয়া করে আপনার whatsapp নাম্বার দিন, আমাদের একজন প্রতিনিধি শিগ্রই আপনার সাথে যোগাযোগ করবে।";
              skipAI = true;
            }
            if (!skipAI) {
              try {
                const openai = getOpenAIClient();
                const chat = await openai.chat.completions.create({
                  model: "gpt-4o-mini",
                  messages: buildMessages(conversationId, text) as any,
                  temperature: 0.4,
                  max_tokens: 300,
                  top_p: 0.9,
                  frequency_penalty: 0.2,
                  presence_penalty: 0.0,
                });

                reply = chat.choices?.[0]?.message?.content || reply;
              } catch (e) {
                console.error("OPENAI ERROR:", lastErr(e));
              }
            }

            try {
              await sendInstagramMessage(pageId, senderId, reply, pageToken);
            } catch (e) {
              console.error("IG SEND ERROR:", lastErr(e));
            }

            const ts2 = new Date();
            await insertMessage({
              conversationId,
              customerName,
              customerProfilePic,
              sender: "bot",
              senderRole: "ai",
              senderName: "AI Bot",
              message: reply,
              platform: "instagram",
              pageId,
              timestamp: ts2,
            });

            emitLiveMessage(req, {
              conversationId,
              customerName,
              customerProfilePic,
              sender: "bot",
              senderRole: "ai",
              senderName: "AI Bot",
              message: reply,
              platform: "instagram",
              pageId,
              timestamp: ts2.toISOString(),
            });
          }
        }
      }
    }

    return res.send("EVENT_RECEIVED");
  } catch (err) {
    console.error("WEBHOOK ERROR:", lastErr(err));
    return res.send("EVENT_RECEIVED");
  }
};

/* ====================== UI: MANUAL REPLY (KEEP ROUTE COMPAT) ====================== */
const manualReply = async (req: Request, res: Response) => {
  try {
    const { conversationId, message, sendAs, replyToMessageId } = req.body || {};
    const msg = normalizeText(message);
    let mode = String(sendAs || "agent").toLowerCase(); // agent|customer

    if (!conversationId || !msg)
      return res.status(400).json({ message: "conversationId and message required" });

    // If replying to a specific message, auto-swap sender like Facebook/WhatsApp inbox.
    const replyToId = replyToMessageId != null ? String(replyToMessageId).trim() : "";
    if (replyToId) {
      try {
        const rows = await queryRows<any>(
          "SELECT id, sender, sender_role AS senderRole FROM social_chat_messages WHERE id=? LIMIT 1",
          [replyToId]
        );
        const ref = rows?.[0];
        const refIsCustomer =
          String(ref?.sender || "").toLowerCase() === "customer" ||
          String(ref?.senderRole || "").toLowerCase() === "customer";
        mode = refIsCustomer ? "agent" : "customer";
      } catch {
        // If we can't resolve the reference message, fall back to explicit sendAs/default.
      }
    }


    // seller lock enforcement (STRICT)
    // IMPORTANT: Do not allow sending a reply unless we successfully lock/assign.
    // Otherwise another seller could reply and steal the lock.
    if (getReqUser(req)?.role === "seller") {
      const myIdStr = String(getReqUser(req)?.id || "").trim();
      if (!myIdStr) {
        return res.status(401).json({ message: "Unauthorized. Please login again." });
      }
      try {
        await enforceSellerConversationLock(conversationId, myIdStr);
      } catch (e: any) {
        const status = Number(e?.status || 403);
        return res.status(status).json({ message: e?.message || "Forbidden" });
      }
    }

    // conversationId format: pageId_senderId
    const [pageId, recipientId] = String(conversationId).split("_");
    if (!pageId || !recipientId)
      return res.status(400).json({ message: "Invalid conversationId" });

    // Read last meta to keep customer identity stable and infer platform.
    const lastRows = await queryRows<any[]>(
      "SELECT platform, page_id AS pageId, customer_name AS customerName, customer_profile_pic AS customerProfilePic FROM social_chat_messages WHERE conversation_id=? ORDER BY timestamp DESC LIMIT 1",
      [conversationId]
    );
    const last = lastRows[0] || null;

    const platform = (last?.platform ||
      (isInstagramPage(pageId) ? "instagram" : "facebook")) as "facebook" | "instagram";

    const customerName = safeString((last as any)?.customerName) || recipientId;
    const customerProfilePic = safeString((last as any)?.customerProfilePic) || "";

    // ======= NEW: "swap" mode (simulate customer message in inbox) =======
    // If sendAs=customer, we DO NOT send anything to Meta.
    // We only store & broadcast a "customer" message so admin/seller can test/continue
    // the conversation from either side like FB/WhatsApp inbox tools.
    if (mode === "customer") {
      const ts = new Date();
      await insertMessage({
        conversationId,
        customerName,
        customerProfilePic,
        sender: "customer",
        senderRole: "customer",
        senderName: customerName || "Customer",
        message: msg,
        replyToMessageId: replyToId || null,
        platform,
        pageId,
        timestamp: ts,
      });

      emitLiveMessage(req, {
        conversationId,
        customerName,
        customerProfilePic,
        sender: "customer",
        senderRole: "customer",
        senderName: customerName || "Customer",
        message: msg,
        replyToMessageId: replyToId || null,
        platform,
        pageId,
        timestamp: ts.toISOString(),
      });

      return res.json({ ok: true });
    }

    // ======= Default: agent message (existing behavior) =======
    const token = getPageTokenByPageId(pageId);
    if (!token) return res.status(400).json({ message: "Page token not found" });

    if (platform === "instagram") await sendInstagramMessage(pageId, recipientId, msg, token);
    else await sendFacebookMessage(recipientId, msg, token);

    const actor = await resolveBotActor(req);

    const ts = new Date();
    await insertMessage({
      conversationId,
      customerName,
      customerProfilePic,
      sender: "bot",
      senderRole: actor.senderRole,
      senderName: actor.senderName,
      message: msg,
        replyToMessageId: replyToId || null,
      platform,
      pageId,
      timestamp: ts,
      });

    emitLiveMessage(req, {
      conversationId,
      customerName,
      customerProfilePic,
      sender: "bot",
      senderRole: actor.senderRole,
      senderName: actor.senderName,
      message: msg,
        replyToMessageId: replyToId || null,
      platform,
      pageId,
      timestamp: ts.toISOString(),
      });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("manualReply error:", lastErr(err));
    return res.status(500).json({ message: "Failed to send" });
  }
};

const manualMediaReply = async (req: Request, res: Response) => {
  try {
    const conversationId = safeString((req.body as any)?.conversationId);
    const replyToMessageId = safeString((req.body as any)?.replyToMessageId);
    let mode = String((req.body as any)?.sendAs || "agent").toLowerCase(); // agent|customer
    if (!conversationId) {
      return res.status(400).json({ message: "conversationId required" });
    }

    // If replying to a specific message, auto-swap sender like Facebook/WhatsApp inbox.
    const replyToId = replyToMessageId ? String(replyToMessageId).trim() : "";
    if (replyToId) {
      try {
        const rows = await queryRows<any>(
          "SELECT id, sender, sender_role AS senderRole FROM social_chat_messages WHERE id=? LIMIT 1",
          [replyToId]
        );
        const ref = rows?.[0];
        const refIsCustomer =
          String(ref?.sender || "").toLowerCase() === "customer" ||
          String(ref?.senderRole || "").toLowerCase() === "customer";
        mode = refIsCustomer ? "agent" : "customer";
      } catch {
        // fall back
      }
    }


    // seller lock enforcement (STRICT, same rules as manualReply)
    if (getReqUser(req)?.role === "seller") {
      const myIdStr = String(getReqUser(req)?.id || "").trim();
      if (!myIdStr) {
        return res.status(401).json({ message: "Unauthorized. Please login again." });
      }
      try {
        await enforceSellerConversationLock(conversationId, myIdStr);
      } catch (e: any) {
        const status = Number(e?.status || 403);
        return res.status(status).json({ message: e?.message || "Forbidden" });
      }
    }

    // conversationId format: pageId_senderId
    const [pageId, recipientId] = String(conversationId).split("_");
    if (!pageId || !recipientId) {
      return res.status(400).json({ message: "Invalid conversationId" });
    }

    const token = mode === "customer" ? "" : getPageTokenByPageId(pageId);
    if (mode !== "customer" && !token) return res.status(400).json({ message: "Page token not found" });

    const lastRows = await queryRows<any[]>(
      "SELECT platform, page_id AS pageId, customer_name AS customerName, customer_profile_pic AS customerProfilePic FROM social_chat_messages WHERE conversation_id=? ORDER BY timestamp DESC LIMIT 1",
      [conversationId]
    );
    const last = lastRows[0] || null;

    const platform = (last?.platform ||
      (isInstagramPage(pageId) ? "instagram" : "facebook")) as
      | "facebook"
      | "instagram";

    // files from multer
    const filesField = (req as any).files as
      | Record<string, Express.Multer.File[]>
      | undefined;

    const allFiles: Express.Multer.File[] = [];
    if (filesField?.files?.length) allFiles.push(...filesField.files);
    if (filesField?.file?.length) allFiles.push(...filesField.file);

    if (!allFiles.length) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // IMPORTANT:
    // - Store media URLs in DB as *relative* (/uploads/...) so the Admin/Seller panel
    //   can render them reliably even when the UI is hosted on a different public URL
    //   (e.g., ngrok exposing :3000 while backend is :5000).
    // - The Next.js UI can proxy `/uploads/*` to the backend using rewrites.
    // - For sending to customers, we still use an absolute URL where needed (IG).
    const base = getPublicBaseUrl(req);

    // keep identity consistent
    const customerName = safeString((last as any)?.customerName) || recipientId;
    const customerProfilePic = safeString((last as any)?.customerProfilePic) || "";

    // send each file (Meta API usually supports one attachment per request)
    // BUT: in the Admin/Seller panel we want a SINGLE chat bubble for multi-select uploads.
    // So we send to Meta per-file, but store/emit ONE combined message when multiple files are selected.

    const storedMediaUrls: string[] = [];
    const storedKinds: Array<"image" | "video" | "file"> = [];

    for (const f of allFiles) {
      const filename = safeString((f as any)?.filename);
      const mimetype = safeString((f as any)?.mimetype);
      if (!filename) continue;

      const relativeUrl = `/uploads/${encodeURIComponent(filename)}`;
      const absoluteUrl = `${base}${relativeUrl}`;

      const isVid = isVideoFile(filename, mimetype);
      const isImg = isImageFile(filename, mimetype);
      const type: "image" | "video" | "file" = isVid ? "video" : isImg ? "image" : "file";

      try {
        if (mode !== "customer") {
          if (platform === "instagram") {
          // IG requires a publicly reachable URL
          await sendInstagramAttachment(pageId, recipientId, type, absoluteUrl, token);
        } else {
          // ✅ FB: upload binary to get attachment_id then send
          const attachmentId = await uploadFacebookAttachment(
            type,
            (f as any).path,
            mimetype,
            token
          );
          await sendFacebookAttachmentById(recipientId, type, attachmentId, token);
          }
        }
      } catch (e) {
        console.error("MEDIA SEND ERROR:", lastErr(e));
        // continue to store + emit so UI doesn't look stuck
      }

      // Accumulate media for a SINGLE stored bubble in panel
      storedMediaUrls.push(relativeUrl);
      storedKinds.push(type);
    }

    // Store/emit ONE message bubble
    const ts = new Date();
    let storedMessage = "";

    if (storedMediaUrls.length === 1) {
      const only = storedMediaUrls[0];
      const onlyKind = storedKinds[0];
      storedMessage =
        onlyKind === "video"
          ? `🎥 Video: ${only}`
          : onlyKind === "image"
          ? `📷 Image: ${only}`
          : only;
    } else {
      const allImages = storedKinds.every((k) => k === "image");
      const allVideos = storedKinds.every((k) => k === "video");

      if (allImages) {
        // ChatWindow already supports this format and renders a single bubble gallery
        storedMessage = `📷 Images:\n${storedMediaUrls.join("\n")}`;
      } else if (allVideos) {
        // Keep consistent single bubble; ChatWindow will parse URLs and render videos
        storedMessage = `🎥 Videos:\n${storedMediaUrls.join("\n")}`;
      } else {
        // Mixed attachments (images + videos + others)
        storedMessage = `📎 Attachments:\n${storedMediaUrls.join("\n")}`;
      }
    }

    const actor = await resolveBotActor(req);

    const asCustomer = mode === "customer";
    await insertMessage({
      conversationId,
      customerName,
      customerProfilePic,
      sender: asCustomer ? "customer" : "bot",
      senderRole: asCustomer ? "customer" : actor.senderRole,
      senderName: asCustomer ? (customerName || "Customer") : actor.senderName,
      message: storedMessage,
      platform,
      pageId,
      timestamp: ts,
    });

    emitLiveMessage(req, {
      conversationId,
      customerName,
      customerProfilePic,
      sender: asCustomer ? "customer" : "bot",
      senderRole: asCustomer ? "customer" : actor.senderRole,
      senderName: asCustomer ? (customerName || "Customer") : actor.senderName,
      message: storedMessage,
      platform,
      pageId,
      timestamp: ts.toISOString(),
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("manualMediaReply error:", lastErr(err));
    return res.status(500).json({ message: "Failed to send media" });
  }
};


/* ====================== UI: FORWARD MESSAGE ====================== */
const guessMimeFromFilename = (filename: string) => {
  const f = String(filename || "").toLowerCase();
  if (f.endsWith(".png")) return "image/png";
  if (f.endsWith(".webp")) return "image/webp";
  if (f.endsWith(".gif")) return "image/gif";
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
  if (f.endsWith(".mp4")) return "video/mp4";
  if (f.endsWith(".mov")) return "video/quicktime";
  if (f.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
};

const extractAllUrlsFromText = (t: string) => {
  if (!t) return [] as string[];
  const matches = t.match(/(https?:\/\/\S+|\/uploads\/[\w%\-.+~@]+(?:\.[\w%\-.+~@]+)?)/g);
  return matches || [];
};

const safeUploadFilenameFromUrl = (u: string) => {
  try {
    const raw = String(u || "").trim();
    if (!raw) return "";

    // Support both:
    // - relative: /uploads/<file>
    // - absolute: https://domain/.../uploads/<file>?query
    let pathname = raw;

    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        const parsed = new URL(raw);
        pathname = parsed.pathname || "";
      } catch {
        // ignore parse error; fall back to raw
        pathname = raw;
      }
    }

    const idx = pathname.indexOf("/uploads/");
    if (idx < 0) return "";

    const after = pathname.slice(idx + "/uploads/".length);
    const decoded = decodeURIComponent(after);
    const base = path.basename(decoded);

    // basic traversal guards
    if (!base || base.includes("..") || base.includes("/") || base.includes("\\") ) return "";
    return base;
  } catch {
    return "";
  }
};


const forwardMessage = async (req: Request, res: Response) => {
  try {
    const targetConversationId = safeString((req.body as any)?.targetConversationId);
    const rawMessage = safeString((req.body as any)?.message);

    if (!targetConversationId || !rawMessage) {
      return res.status(400).json({ message: "targetConversationId and message required" });
    }

    // conversationId format: pageId_senderId
    const [pageId, recipientId] = String(targetConversationId).split("_");
    if (!pageId || !recipientId) {
      return res.status(400).json({ message: "Invalid targetConversationId" });
    }

    const token = getPageTokenByPageId(pageId);
    if (!token) return res.status(400).json({ message: "Page token not found" });

    const lastRows = await queryRows<any[]>(
      "SELECT platform, customer_name AS customerName, customer_profile_pic AS customerProfilePic FROM social_chat_messages WHERE conversation_id=? ORDER BY timestamp DESC LIMIT 1",
      [targetConversationId]
    );
    const last = lastRows[0] || null;

    const platform = (last?.platform || (isInstagramPage(pageId) ? "instagram" : "facebook")) as
      | "facebook"
      | "instagram";

    const customerName = safeString((last as any)?.customerName) || recipientId;
    const customerProfilePic = safeString((last as any)?.customerProfilePic) || "";

    // Who is forwarding (admin/seller). Stored in message metadata for correct UI labeling.
    const actor = await resolveBotActor(req);

    // Decide whether this looks like a media bubble we can forward
    const urls = extractAllUrlsFromText(rawMessage);

// We support forwarding:
// 1) Local files previously downloaded to /uploads (relative or absolute URL to our server)
// 2) Remote https URLs (Meta CDN, etc.) by sending attachment via URL when possible
const uploadUrls = urls.filter((u) => Boolean(safeUploadFilenameFromUrl(u)));
const remoteUrls = urls.filter((u) => {
  const s = String(u || "").trim();
  return (s.startsWith("http://") || s.startsWith("https://")) && !safeUploadFilenameFromUrl(s);
});

const hasForwardableMedia = uploadUrls.length > 0 || remoteUrls.length > 0;

    if (!hasForwardableMedia) {
      // Plain text forward
      const msg = normalizeText(rawMessage);
      if (!msg) return res.status(400).json({ message: "message required" });

      if (platform === "instagram") await sendInstagramMessage(pageId, recipientId, msg, token);
      else await sendFacebookMessage(recipientId, msg, token);

      const ts = new Date();
      await insertMessage({
        conversationId: targetConversationId,
        customerName,
        customerProfilePic,
        sender: "bot",
        senderRole: actor.senderRole,
        senderName: actor.senderName,
        message: msg,
        platform,
        pageId,
        timestamp: ts,
      });

      emitLiveMessage(req, {
        conversationId: targetConversationId,
        customerName,
        customerProfilePic,
        sender: "bot",
        senderRole: actor.senderRole,
        senderName: actor.senderName,
        message: msg,
        platform,
        pageId,
        timestamp: ts.toISOString(),
      });

      return res.json({ ok: true });
    }

    // Media forward (only supports files that exist in our /uploads folder)
    const baseUrl = getPublicBaseUrl(req);

    const storedMediaUrls: string[] = [];
    const storedKinds: Array<"image" | "video" | "file"> = [];

    for (const u of uploadUrls) {
      const filename = safeUploadFilenameFromUrl(u);
      if (!filename) continue;

      const localPath = path.join(process.cwd(), "uploads", filename);
      if (!fs.existsSync(localPath)) continue;

      const mime = guessMimeFromFilename(filename);
      const type: "image" | "video" | "file" = isVideoFile(filename, mime)
        ? "video"
        : isImageFile(filename, mime)
        ? "image"
        : "file";

      const relativeUrl = `/uploads/${encodeURIComponent(filename)}`;
      const absoluteUrl = `${baseUrl}${relativeUrl}`;

      try {
        if (platform === "instagram") {
          await sendInstagramAttachment(pageId, recipientId, type, absoluteUrl, token);
        } else {
          const attachmentId = await uploadFacebookAttachment(type, localPath, mime, token);
          await sendFacebookAttachmentById(recipientId, type, attachmentId, token);
        }
      } catch (e) {
        console.error("FORWARD MEDIA SEND ERROR:", lastErr(e));
      }

      storedMediaUrls.push(relativeUrl);
      storedKinds.push(type);
    }

    
    // Also try forwarding remote URLs (e.g., Meta CDN) via URL payload
    for (const u of remoteUrls) {
      const raw = String(u || "").trim();
      if (!raw) continue;

      // Guess media type robustly (prefer actual content-type, then URL extension)
      const basename = (() => {
        try { return path.basename(new URL(raw).pathname || ""); } catch { return path.basename(raw); }
      })();

      const hintedMime = guessMimeFromFilename(basename) || guessMimeFromUrl(raw);
      const fetchedMime = hintedMime ? "" : await fetchRemoteContentType(raw);
      const mime = (hintedMime || fetchedMime || "application/octet-stream").toLowerCase();

      const type: "image" | "video" | "file" =
        mime.startsWith("video/") ? "video" :
        mime.startsWith("image/") ? "image" :
        "file";

      try {
        if (platform === "instagram") {
          await sendInstagramAttachment(pageId, recipientId, type, raw, token);
        } else {
          await sendFacebookAttachmentByUrl(recipientId, type, raw, token);
        }
      } catch (e) {
        console.error("FORWARD REMOTE MEDIA SEND ERROR:", lastErr(e));
      }

      // Store as-is (remote URL) so UI can render it
      storedMediaUrls.push(raw);
      storedKinds.push(type);
    }

if (!storedMediaUrls.length) {
      // Fallback: forward as plain text with URLs
      const msg = normalizeText(rawMessage);
      if (platform === "instagram") await sendInstagramMessage(pageId, recipientId, msg, token);
      else await sendFacebookMessage(recipientId, msg, token);

      const ts = new Date();
      await insertMessage({
        conversationId: targetConversationId,
        customerName,
        customerProfilePic,
        sender: "bot",
        senderRole: actor.senderRole,
        senderName: actor.senderName,
        message: msg,
        platform,
        pageId,
        timestamp: ts,
      });

      emitLiveMessage(req, {
        conversationId: targetConversationId,
        customerName,
        customerProfilePic,
        sender: "bot",
        senderRole: actor.senderRole,
        senderName: actor.senderName,
        message: msg,
        platform,
        pageId,
        timestamp: ts.toISOString(),
      });

      return res.json({ ok: true, forwardedAsText: true });
    }

    // Store/emit ONE message bubble (same format as manualMediaReply)
    let storedMessage = "";
    if (storedMediaUrls.length === 1) {
      const only = storedMediaUrls[0];
      const onlyKind = storedKinds[0];
      storedMessage =
        onlyKind === "video"
          ? `🎥 Video: ${only}`
          : onlyKind === "image"
          ? `📷 Image: ${only}`
          : only;
    } else {
      const allImages = storedKinds.every((k) => k === "image");
      const allVideos = storedKinds.every((k) => k === "video");

      if (allImages) storedMessage = `📷 Images:\n${storedMediaUrls.join("\n")}`;
      else if (allVideos) storedMessage = `🎥 Videos:\n${storedMediaUrls.join("\n")}`;
      else storedMessage = `📎 Attachments:\n${storedMediaUrls.join("\n")}`;
    }

    const ts = new Date();
    await insertMessage({
      conversationId: targetConversationId,
      customerName,
      customerProfilePic,
      sender: "bot",
      senderRole: actor.senderRole,
      senderName: actor.senderName,
      message: storedMessage,
      platform,
      pageId,
      timestamp: ts,
    });

    emitLiveMessage(req, {
      conversationId: targetConversationId,
      customerName,
      customerProfilePic,
      sender: "bot",
      senderRole: actor.senderRole,
      senderName: actor.senderName,
      message: storedMessage,
      platform,
      pageId,
      timestamp: ts.toISOString(),
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("forwardMessage error:", lastErr(err));
    return res.status(500).json({ message: "Failed to forward" });
  }
};
/* ====================== EXPORT (ROUTE COMPAT) ====================== */
export const SocialAiBotController = {
  handleFacebookWebhook,
  getConversations,
  getMessagesByConversation,
  updateConversationMeta,
  manualReply,
  manualMediaReply,
  forwardMessage,
};

