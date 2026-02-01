import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

// NOTE: historically seller token payload used `{ id, role: 'seller' }`.
// Some older code expected `{ sellerId }`. We support both for compatibility.
type JwtPayload = { id: string; role: "seller" | "admin"; sellerId?: string };

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

const tryParseBearer = (req: Request): JwtPayload | null => {
  try {
    const h = String(req.headers.authorization || "");
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
};

export const authOptional = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    return next();
  } catch {
    // invalid token -> treat as unauth
    return next();
  }
};

export const requireSellerAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const h = String(req.headers.authorization || "");
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Unauthorized (no token)" });

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const sellerId = String((decoded as any)?.sellerId || (decoded as any)?.id || "");
    if (!sellerId) return res.status(401).json({ message: "Unauthorized (token invalid/expired)" });

    // normalize
    req.user = { id: sellerId, role: "seller" };
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized (token invalid/expired)" });
  }
};

export const requireAdminOrSeller = (req: Request, res: Response, next: NextFunction) => {
  const key = String(req.headers["x-admin-key"] || "");
  const expected = String(process.env.ADMIN_API_KEY || "");

  // ✅ Admin (by key)
  if (expected && key && key === expected) {
    req.user = { id: "admin", role: "admin" };
    return next();
  }

  // ✅ Admin (by JWT)
  const decoded = tryParseBearer(req);
  if (decoded && decoded.role === "admin") {
    req.user = { id: String((decoded as any).id || "admin"), role: "admin" };
    return next();
  }

  // ✅ Otherwise must be seller token
  return requireSellerAuth(req, res, next);
};

export const requireAdminKey = (req: Request, res: Response, next: NextFunction) => {
  // Allow admin JWT as well (for UI login)
  const decoded = tryParseBearer(req);
  if (decoded && decoded.role === "admin") return next();

  const key = String(req.headers["x-admin-key"] || "");
  const expected = String(process.env.ADMIN_API_KEY || "");
  if (!expected) return res.status(500).json({ message: "ADMIN_API_KEY missing in .env" });
  if (key !== expected) return res.status(401).json({ message: "Unauthorized" });
  return next();
};
