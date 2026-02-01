"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const doLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Login failed");
      }
      const data = await res.json();
      const token = data?.token || "";
      if (!token) throw new Error("Token missing from server");

      // store for API calls
      localStorage.setItem("admin_token_v1", token);
      localStorage.setItem("admin_session_v1", "true");

      // cookie for middleware route guard (NOT httpOnly)
      document.cookie = `admin_token_v1=${encodeURIComponent(token)}; path=/`;
      document.cookie = `admin_session_v1=true; path=/`;

      router.replace("/admin/inbox");
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f6f6] p-6">
      <div className="w-full max-w-md bg-white border border-black/10 rounded-2xl shadow-sm p-6">
        <div className="text-2xl font-bold">Admin Login</div>
        <div className="text-xs text-gray-500 mt-1">Social AI Bot</div>

        <form onSubmit={doLogin} className="mt-6 space-y-4">
          <div>
            <div className="text-sm font-semibold mb-1">Username</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-black/10"
              placeholder="admin"
              autoComplete="username"
            />
          </div>

          <div>
            <div className="text-sm font-semibold mb-1">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-black/10"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <button
            disabled={loading}
            className="w-full px-4 py-3 rounded-lg border border-black/10 hover:bg-black hover:text-white transition disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
