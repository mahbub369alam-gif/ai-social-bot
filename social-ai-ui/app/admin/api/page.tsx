"use client";

import { useEffect, useMemo, useState } from "react";

const ADMIN_KEY_LS = "social_ai_admin_key_v1";

function buildAdminHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("admin_token_v1") || "";
  if (token) return { Authorization: `Bearer ${token}` };
  const key = window.localStorage.getItem(ADMIN_KEY_LS) || "";
  return key ? { "x-admin-key": key } : {};
}

async function safeReadJsonMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.message || data?.error || data?.warn || "";
  } catch {
    try {
      return await res.text();
    } catch {
      return "";
    }
  }
}

type FbIntegration = {
  source: "database" | "env" | "none";
  platform: "facebook";
  pageId: string;
  pageTokenMasked: string;
  updatedAt: string | null;
};

export default function ApiIntegrationPage() {
  const API_BASE = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_API_BASE;
    if (envBase) return envBase;

    // ✅ Local dev default
    // - Next.js admin panel runs on :3000
    // - Backend API typically runs on :5000
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return "http://localhost:5000";
      }
    }

    // Production default: same-origin (works behind a reverse proxy)
    return "";
  }, []);

  const [tab, setTab] = useState<"facebook" | "instagram" | "whatsapp">(
    "facebook"
  );

  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(ADMIN_KEY_LS) || "";
  });

  const [pageId, setPageId] = useState("");
  const [pageToken, setPageToken] = useState("");
  const [current, setCurrent] = useState<FbIntegration | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const persistAdminKey = (val: string) => {
    setAdminKey(val);
    try {
      localStorage.setItem(ADMIN_KEY_LS, val);
    } catch {
      // ignore
    }
  };

  const loadFacebook = async () => {
    setErr("");
    setOk("");
    setLoading(true);
    try {
      const headersBase = buildAdminHeaders();
      if (!headersBase.Authorization && !headersBase["x-admin-key"]) {
        throw new Error(
          "Admin login করুন অথবা Admin API Key দিন (backend .env এর ADMIN_API_KEY)"
        );
      }

      const res = await fetch(`${API_BASE}/api/integrations/facebook`, {
        method: "GET",
        headers: { ...headersBase },
        cache: "no-store",
      });

      if (!res.ok) {
        const msg = await safeReadJsonMessage(res);
        throw new Error(msg || `Failed (${res.status})`);
      }

      const data = (await res.json()) as FbIntegration;
      setCurrent(data);
      // prefill pageId; never prefill token
      if (data?.pageId) setPageId(data.pageId);
    } catch (e: any) {
      setErr(e?.message || "Failed to load integration");
    } finally {
      setLoading(false);
    }
  };

  const saveFacebook = async () => {
    setErr("");
    setOk("");
    setSaving(true);
    try {
      const headersBase = buildAdminHeaders();
      if (!headersBase.Authorization && !headersBase["x-admin-key"]) {
        throw new Error(
          "Admin login করুন অথবা Admin API Key দিন (backend .env এর ADMIN_API_KEY)"
        );
      }

      const res = await fetch(`${API_BASE}/api/integrations/facebook`, {
        method: "POST",
        headers: {
          ...headersBase,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pageId: pageId.trim(), pageToken: pageToken.trim() }),
      });

      if (!res.ok) {
        const msg = await safeReadJsonMessage(res);
        throw new Error(msg || `Save failed (${res.status})`);
      }

      const data = await res.json();
      setOk(
        data?.warn
          ? `Saved ✅ (but: ${String(data.warn)})`
          : "Saved ✅"
      );
      setPageToken("");
      await loadFacebook();
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (tab !== "facebook") return;
    loadFacebook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">🔌 API Integration</h1>

      <div className="mt-4 rounded-lg border p-4">
        <div className="text-sm text-gray-600">
          Admin API Key (optional):
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={adminKey}
            onChange={(e) => persistAdminKey(e.target.value)}
            placeholder="ADMIN_API_KEY (optional if admin login token exists)"
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              try {
                localStorage.removeItem(ADMIN_KEY_LS);
              } catch {}
              setAdminKey("");
            }}
            className="rounded border px-3 py-2 text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setTab("facebook")}
          className={`rounded px-4 py-2 text-sm border ${
            tab === "facebook" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Facebook Page
        </button>
        <button
          onClick={() => setTab("instagram")}
          className={`rounded px-4 py-2 text-sm border ${
            tab === "instagram" ? "bg-black text-white" : "bg-white"
          }`}
        >
          Instagram (show only)
        </button>
        <button
          onClick={() => setTab("whatsapp")}
          className={`rounded px-4 py-2 text-sm border ${
            tab === "whatsapp" ? "bg-black text-white" : "bg-white"
          }`}
        >
          WhatsApp (show only)
        </button>
      </div>

      {tab !== "facebook" ? (
        <div className="mt-6 rounded border p-6">
          <div className="text-lg font-semibold">Coming Soon</div>
          <p className="mt-2 text-gray-600">
            আপাতত এটা শুধু UI তে দেখাবে। Facebook Page integration এখন কাজ করবে।
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded border p-6">
          <div className="text-lg font-semibold">Facebook Page</div>
          <p className="mt-2 text-gray-600">
            Page ID + Page Access Token দিন → এটা DB + .env এ save হবে, যাতে আর
            ম্যানুয়ালি .env এ বসাতে না হয়।
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">Page ID</div>
              <input
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="e.g. 1234567890"
                className="mt-2 w-full rounded border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <div className="text-sm font-medium">Page Access Token</div>
              <input
                value={pageToken}
                onChange={(e) => setPageToken(e.target.value)}
                placeholder="Paste token here"
                className="mt-2 w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={saveFacebook}
              disabled={saving || !pageId.trim() || !pageToken.trim()}
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={loadFacebook}
              disabled={loading}
              className="rounded border px-4 py-2 text-sm"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {err ? (
            <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}
          {ok ? (
            <div className="mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {ok}
            </div>
          ) : null}

          <div className="mt-6 rounded bg-gray-50 p-4 text-sm">
            <div className="font-medium">Current (server)</div>
            <div className="mt-2">
              <div>
                <span className="text-gray-600">Source:</span> {current?.source || "-"}
              </div>
              <div>
                <span className="text-gray-600">Page ID:</span> {current?.pageId || "-"}
              </div>
              <div>
                <span className="text-gray-600">Token:</span> {current?.pageTokenMasked || "-"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
