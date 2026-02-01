"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { LiveMsg } from "@/types/chat";
import ConversationList from "./ConversationList";
import ChatWindow from "./ChatWindow";
import { usePathname, useRouter } from "next/navigation";

type ConversationsMap = Record<string, LiveMsg[]>;

// Small helper to read JWT payload in the browser
const decodeJwt = (token: string): any => {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export default function ChatDashboard() {
  const pathname = usePathname();
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationsMap>({});
  const [conversationMeta, setConversationMeta] = useState<
    Record<string, { assignedSellerId: string | null; deliveryStatus?: string | null; assignedAt?: string | null }>
  >({});
  // NOTE: backend returns sellers with `id` (string) not `_id`.
  // We normalize to `_id` for the UI so components can rely on one field.
  const [sellers, setSellers] = useState<
    Array<{ _id?: string; id?: string; name?: string; firstName?: string; lastName?: string; email?: string }>
  >([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ✅ Responsive breakpoint helper.
  // Desktop (md+) keeps the old behavior (auto-select a thread).
  // Mobile starts in "customer list" view and only opens chat after selecting.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Guard for non-browser environments (though this is a client component)
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // ✅ API base
  const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000";

  // ✅ auth headers
  // Admin pages can authenticate either by:
  // - JWT stored as `admin_token_v1` (preferred)
  // - Admin API key stored as `social_ai_admin_key_v1`
  // Seller pages authenticate by JWT stored as `seller_token_v1`
  const authHeaders = useMemo(() => {
    try {
      const isAdmin = pathname?.startsWith("/admin");
      const adminToken = localStorage.getItem("admin_token_v1") || "";
      const adminKey = localStorage.getItem("social_ai_admin_key_v1") || "";
      const sellerToken = localStorage.getItem("seller_token_v1") || "";

      // ✅ Admin route: prefer admin JWT, fallback to admin key
      if (isAdmin) {
        if (adminToken) return { Authorization: `Bearer ${adminToken}` };
        if (adminKey) return { "x-admin-key": adminKey };
      }

      // ✅ Seller route
      if (sellerToken) return { Authorization: `Bearer ${sellerToken}` };
    } catch {
      // ignore
    }
    return {} as Record<string, string>;
  }, [pathname]);

  // ✅ Current seller id (used to hide threads that are assigned to another seller)
  const currentSellerId = useMemo(() => {
    try {
      if (pathname?.startsWith("/admin")) return "";
      const token = localStorage.getItem("seller_token_v1") || "";
      const p = decodeJwt(token) || {};
      return String(p?.sellerId || p?.id || "");
    } catch {
      return "";
    }
  }, [pathname]);

  const isAdminPath = pathname?.startsWith("/admin");

  // ✅ Admin: load seller list for assignment dropdown
  useEffect(() => {
    if (!isAdminPath) return;

    const loadSellers = async () => {
      try {
        const res = await fetch(`${API}/api/sellers`, { headers: authHeaders, cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];

        // Normalize seller id field so dropdown never sends "assign:undefined"
        // when backend returns `{ id }`.
        const normalized = (rows || [])
          .map((s: any) => ({
            ...s,
            _id: String(s?._id || s?.id || ""),
          }))
          .filter((s: any) => !!s._id);

        setSellers(normalized);
      } catch {
        // ignore
      }
    };

    loadSellers();
  }, [API, authHeaders, isAdminPath]);

  // 1) ✅ Load history from DB on first load
  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoadingHistory(true);

        // If seller is not logged in, redirect to login
        if (pathname?.startsWith("/seller")) {
          const token = localStorage.getItem("seller_token_v1") || "";
          if (!token) {
            router.push("/seller/login");
            return;
          }
        }

        // 1) get conversation list
        const convRes = await fetch(`${API}/api/social-ai-bot/conversations`, {
          headers: authHeaders,
          cache: "no-store",
        });

        if (convRes.status === 401 || convRes.status === 403) {
          // Unauthorized: kick to login pages
          if (pathname?.startsWith("/admin")) router.push("/admin/login");
          if (pathname?.startsWith("/seller")) router.push("/seller/login");
          return;
        }

        const convJson = await convRes.json();
        // API may return either an array directly or { data: [...] }
        const conversationsFromDb: Array<any> = Array.isArray(convJson) ? convJson : (convJson?.data || []);

        // store assignment/meta for admin UI
        const meta: Record<string, any> = {};
        conversationsFromDb.forEach((c) => {
          if (!c?.conversationId) return;
          meta[c.conversationId] = {
            assignedSellerId: c.assignedSellerId || null,
            deliveryStatus: c.deliveryStatus || null,
            assignedAt: c.assignedAt || null,
          };
        });
        setConversationMeta(meta);

        // 2) for each conversation, fetch messages
        const map: ConversationsMap = {};
        await Promise.all(
          conversationsFromDb.map(async (c) => {
            try {
              const msgRes = await fetch(
                `${API}/api/social-ai-bot/messages/${encodeURIComponent(c.conversationId)}`,
                { headers: authHeaders, cache: "no-store" }
              );
              const msgJson = await msgRes.json();
              map[c.conversationId] = Array.isArray(msgJson) ? msgJson : (msgJson?.data || []);
            } catch {
              map[c.conversationId] = [];
            }
          })
        );

        setConversations(map);

        // ⚠️ Do NOT auto-open a chat on mobile.
        // Desktop auto-selection is handled in a separate effect below.
      } catch (e) {
        console.error("loadHistory error:", e);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [API, authHeaders, pathname, router]);

  // 2) ✅ Socket live updates
  useEffect(() => {
    const socket = getSocket();

    socket.on("connect", () => {
      console.log("UI connected:", socket.id);
    });

    const onAnyLive = (msg: LiveMsg) => {
      if (!msg?.conversationId) return;

      setConversations((prev) => {
        const list = prev[msg.conversationId] || [];
        return { ...prev, [msg.conversationId]: [...list, msg] };
      });

      // If nothing selected yet, auto focus ONLY on desktop.
      if (isDesktop) {
        setActiveId((prev) => (prev ? prev : msg.conversationId));
      }
    };

    // ✅ listen to both event names (backend may emit either)
    socket.on("new_message", onAnyLive);
    socket.on("live_message", onAnyLive);

    // 🔔 assignment/status updates (admin actions)
    const onMeta = (m: any) => {
      if (!m?.conversationId) return;
      setConversationMeta((prev) => ({
        ...prev,
        [m.conversationId]: {
          assignedSellerId: m.assignedSellerId ?? null,
          deliveryStatus: m.deliveryStatus ?? null,
          assignedAt: m.assignedAt ?? null,
        },
      }));

      // If seller and this thread is no longer visible, drop it from list
      if (!isAdminPath) {
        const assigned = m.assignedSellerId;
        if (assigned && currentSellerId && String(assigned) !== String(currentSellerId)) {
          setConversations((prev) => {
            const next = { ...prev };
            delete next[m.conversationId];
            return next;
          });
          setActiveId((prev) => (prev === m.conversationId ? null : prev));
        }
      }
    };

    socket.on("conversation_meta", onMeta);

    return () => {
      socket.off("connect");
      socket.off("new_message", onAnyLive);
      socket.off("live_message", onAnyLive);
      socket.off("conversation_meta", onMeta);
    };
  }, [isDesktop, isAdminPath, currentSellerId]);

  // 2.5) ✅ Poll conversation list so NEW threads show even if sockets are blocked
  useEffect(() => {
    let cancelled = false;

    const normalizeConv = (json: any) =>
      Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];

    const tick = async () => {
      try {
        const convRes = await fetch(`${API}/api/social-ai-bot/conversations`, {
          headers: authHeaders,
          cache: "no-store",
        });
        if (!convRes.ok) return;
        const convJson = await convRes.json();
        const rows: Array<any> = normalizeConv(convJson);
        if (cancelled) return;

        // update meta cache
        setConversationMeta((prev) => {
          const next = { ...prev };
          rows.forEach((c) => {
            if (!c?.conversationId) return;
            next[c.conversationId] = {
              assignedSellerId: c.assignedSellerId || null,
              deliveryStatus: c.deliveryStatus || null,
              assignedAt: c.assignedAt || null,
            };
          });
          return next;
        });

        const ids = rows.map((r) => r.conversationId).filter(Boolean);

        // ✅ For sellers: if a conversation disappears from server list (e.g. re-assigned), remove it locally
        if (!isAdminPath) {
          setConversations((prev) => {
            const next: ConversationsMap = {};
            ids.forEach((id) => {
              if (prev[id]) next[id] = prev[id];
            });
            return next;
          });
          setActiveId((prev) => (prev && ids.includes(prev) ? prev : null));
        }
        const missing = ids.filter((id) => !(id in conversations));
        if (missing.length === 0) return;

        const additions: ConversationsMap = {};
        await Promise.all(
          missing.map(async (id) => {
            try {
              const msgRes = await fetch(
                `${API}/api/social-ai-bot/messages/${encodeURIComponent(id)}`,
                { headers: authHeaders, cache: "no-store" }
              );
              const msgJson = await msgRes.json();
              additions[id] = Array.isArray(msgJson) ? msgJson : (msgJson?.data || []);
            } catch {
              additions[id] = [];
            }
          })
        );

        if (cancelled) return;
        setConversations((prev) => ({ ...prev, ...additions }));
      } catch {
        // ignore
      }
    };

    const t = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [API, authHeaders, conversations]);

  // ✅ Desktop auto-select: pick newest conversation when none is selected.
  useEffect(() => {
    if (!isDesktop) return;
    if (activeId) return;

    const ids = Object.keys(conversations);
    if (ids.length === 0) return;

    const newest = ids
      .map((id) => {
        const last = conversations[id]?.[conversations[id].length - 1];
        return { id, t: last?.timestamp ? new Date(last.timestamp).getTime() : 0 };
      })
      .sort((a, b) => b.t - a.t)[0];

    if (newest?.id) setActiveId(newest.id);
  }, [isDesktop, activeId, conversations]);

  // 3) ✅ Fallback: Poll active conversation so UI updates even if socket is unavailable
  useEffect(() => {
    if (!activeId) return;

    let cancelled = false;

    const normalize = (json: any) => (Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []);

    const refresh = async () => {
      try {
        const res = await fetch(
          `${API}/api/social-ai-bot/messages/${encodeURIComponent(activeId)}`,
          { headers: authHeaders, cache: "no-store" }
        );
        if (!res.ok) return;
        const json = await res.json();
        const list = normalize(json);
        if (cancelled) return;
        setConversations((prev) => ({ ...prev, [activeId]: list }));
      } catch {
        // ignore
      }
    };

    // initial + interval
    refresh();
    const t = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [activeId, API, authHeaders]);
  // ✅ sidebar list items derived from conversations
  const sidebarItems = useMemo(() => {
    const ids = Object.keys(conversations);

    const rows = ids
      .map((conversationId) => {
        const list = conversations[conversationId] || [];
        const last = list[list.length - 1];

        const meta = conversationMeta[conversationId];
        return {
          conversationId,
          customerName: last?.customerName || "Customer",
          customerProfilePic: last?.customerProfilePic || "",
          platform: last?.platform || "unknown",
          lastMessage: last?.message || "",
          lastTime: last?.timestamp || new Date().toISOString(),
          assignedSellerId: meta?.assignedSellerId || null,
          deliveryStatus: meta?.deliveryStatus || null,
        };
      })
      // ✅ Seller side hard filter (prevents cached threads from staying visible)
      .filter((row) => {
        if (isAdminPath) return true;
        const assigned = row.assignedSellerId;
        if (!assigned) return true; // unassigned -> visible to all sellers
        if (!currentSellerId) return false;
        return String(assigned) === String(currentSellerId);
      })
      .sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());

    return rows;
  }, [conversations, conversationMeta, isAdminPath, currentSellerId]);

  const updateMeta = async (
    conversationId: string,
    patch: { sellerId?: string | null; deliveryStatus?: string }
  ) => {
    try {
      const res = await fetch(
        `${API}/api/social-ai-bot/conversations/${encodeURIComponent(conversationId)}/meta`,
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        console.error("Meta update failed:", res.status, j);
        alert(j?.message || "Update failed");
        return;
      }
      const json = await res.json().catch(() => ({}));
      setConversationMeta((prev) => ({
        ...prev,
        [conversationId]: {
          assignedSellerId: json?.assignedSellerId ?? null,
          deliveryStatus: json?.deliveryStatus ?? null,
          assignedAt: json?.assignedAt ?? null,
        },
      }));
    } catch {
      alert("Update failed");
    }
  };

  const activeMessages = activeId ? conversations[activeId] || [] : [];
  const activeTitle = activeId ? `${activeMessages[activeMessages.length - 1]?.customerName || activeId}` : "Select a customer";
  const activeProfilePic = activeId ? (activeMessages[activeMessages.length - 1]?.customerProfilePic || "") : "";
  const conversationTargets = useMemo(() => {
    const ids = Object.keys(conversations || {});
    return ids
      .map((id) => {
        const msgs = conversations[id] || [];
        const last = msgs.length ? msgs[msgs.length - 1] : ({} as any);
        return {
          conversationId: id,
          title: String(last?.customerName || id),
          profilePic: String(last?.customerProfilePic || ""),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [conversations]);


  // ✅ Messenger-style mobile UX:
  // - Mobile: list full-screen, then chat full-screen (back button to list)
  // - Desktop: list + chat side-by-side
  const showChatOnMobile = !!activeId;

  return (
    <div className="h-full min-h-0 grid grid-cols-12">
      {/* Conversation List */}
      <div
        className={[
          "col-span-12 md:col-span-3 bg-white border-r border-[#000000]",
          showChatOnMobile ? "hidden md:block" : "block",
        ].join(" ")}
      >
        <ConversationList
          items={sidebarItems}
          activeId={activeId}
          onSelect={(id) => setActiveId(id)}
          isAdmin={!!isAdminPath}
          sellers={sellers}
          onUpdateMeta={updateMeta}
        />
      </div>

      {/* Chat */}
      <div
        className={[
          // ✅ min-h-0 ensures the nested flex/overflow layout doesn't push the input below the viewport
          "col-span-12 md:col-span-9 bg-white flex flex-col min-h-0",
          showChatOnMobile ? "block" : "hidden md:block",
        ].join(" ")}
      >
        {loadingHistory && (
          <div className="px-4 md:px-6 py-3 text-sm text-gray-500">Loading history...</div>
        )}

        <div className="flex-1 min-h-0">
          <ChatWindow
            title={activeTitle}
            profilePic={activeProfilePic}
            messages={activeMessages}
            forwardTargets={conversationTargets}

            conversationId={activeId}
            isAdmin={!!isAdminPath}
            sellers={sellers}
            assignedSellerId={activeId ? (conversationMeta?.[activeId]?.assignedSellerId ?? null) : null}
            deliveryStatus={activeId ? (conversationMeta?.[activeId]?.deliveryStatus ?? null) : null}
            onUpdateMeta={updateMeta}
            onSent={() => {
              if (!activeId) return;
              fetch(`${API}/api/social-ai-bot/messages/${encodeURIComponent(activeId)}`, {
                headers: authHeaders,
                cache: "no-store",
              })
                .then((r) => (r.ok ? r.json() : null))
                .then((json) => {
                  if (!json) return;
                  const list = Array.isArray(json) ? json : (json?.data || []);
                  setConversations((prev) => ({ ...prev, [activeId]: list }));
                })
                .catch(() => {});
            }}
            onBack={() => setActiveId(null)}
            showBackOnMobile
          />
        </div>
      </div>
    </div>
  );
}