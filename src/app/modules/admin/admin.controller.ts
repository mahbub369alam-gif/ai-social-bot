import { Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

// Credentials come from .env
// ADMIN_USERNAME=...
// ADMIN_PASSWORD=...
// If not provided, fallback to username "admin" and password ADMIN_API_KEY (legacy)
const getCreds = () => {
  const username = String(process.env.ADMIN_USERNAME || "admin").trim();
  const password = String(process.env.ADMIN_PASSWORD || process.env.ADMIN_API_KEY || "").trim();
  return { username, password };
};

const signAdminToken = () => {
  return jwt.sign({ id: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
};

const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    const inputU = String(username || "").trim();
    const inputP = String(password || "").trim();
    const creds = getCreds();

    // If server credentials aren't configured, be explicit.
    if (!creds.password) {
      return res.status(500).json({ message: "Admin credentials not configured. Set ADMIN_PASSWORD (or ADMIN_API_KEY) in .env" });
    }

    if (inputU !== creds.username || inputP !== creds.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signAdminToken();
    return res.json({ token, admin: { username: creds.username } });
  } catch (e) {
    console.error("admin login error:", e);
    return res.status(500).json({ message: "Login failed" });
  }
};

export const AdminController = { login };
