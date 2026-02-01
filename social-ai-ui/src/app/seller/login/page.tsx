"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ✅ Seller Login
 * - Auth is done against backend (MongoDB) instead of localStorage.
 * - Endpoint: POST /api/sellers/login
 */

const TOKEN_KEY = "seller_token_v1";
const SESSION_KEY = "seller_session_v1";

type LoginRes = {
  token: string;
  seller: { id: string; name: string; email: string };
};

async function safeReadJsonMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.message || data?.error || "";
  } catch {
    try {
      return await res.text();
    } catch {
      return "";
    }
  }
}

export default function SellerLoginPage() {
  const router = useRouter();
  const API_BASE = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000",
    []
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setErr("");
    const em = email.trim().toLowerCase();
    const pw = password.trim();
    if (!em || !pw) return setErr("Email এবং Password দিন");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sellers/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, password: pw }),
      });

      if (!res.ok) {
        const msg = await safeReadJsonMessage(res);
        throw new Error(msg || "Wrong Email / Password");
      }

      const data = (await res.json()) as LoginRes;
      if (!data?.token) throw new Error("Token পাওয়া যায়নি");

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          sellerId: data.seller?.id,
          name: data.seller?.name,
          email: data.seller?.email,
          ts: new Date().toISOString(),
        })
      );

      // ✅ Also set cookies so Next.js middleware can block direct URL paste
      try {
        const maxAge = 60 * 60 * 24 * 30; // 30 days
        document.cookie = `${TOKEN_KEY}=${encodeURIComponent(data.token)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
        document.cookie = `${SESSION_KEY}=${encodeURIComponent(
          JSON.stringify({ sellerId: data.seller?.id, name: data.seller?.name })
        )}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
      } catch {
        // ignore
      }

      router.replace("/seller");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center px-4">
      <div className="w-full max-w-[520px] bg-[#1b1b1b] border border-white/10 rounded-3xl p-8">
        <div className="text-white text-2xl font-bold">Seller Login</div>
        <div className="text-gray-400 text-sm mt-2">
          Login with your Email and Password
        </div>

        <div className="mt-8 space-y-4">
          <div>
            <label className="text-gray-300 text-sm">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seller@email.com"
              className="mt-2 w-full rounded-2xl px-5 py-3 bg-[#2a2a2a] text-white outline-none border border-white/10 focus:border-white/30"
            />
          </div>

          <div>
            <label className="text-gray-300 text-sm">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              type="password"
              className="mt-2 w-full rounded-2xl px-5 py-3 bg-[#2a2a2a] text-white outline-none border border-white/10 focus:border-white/30"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
            />
          </div>

          {err && <div className="text-red-400 text-sm">{err}</div>}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="mt-2 w-full rounded-2xl py-3 bg-white text-black font-semibold hover:opacity-90 active:scale-[0.99] transition disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
