// Customer inbox section

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveMsg } from "@/types/chat";

export default function ChatWindow({
  title,
  profilePic,
  messages,
  conversationId,
  forwardTargets,

  onBack,
  showBackOnMobile,
  onSent,
  isAdmin,
  sellers,
  assignedSellerId,
  deliveryStatus,
  onUpdateMeta,
}: {
  title: string;
  profilePic?: string;
  messages: LiveMsg[];
  conversationId: string | null;
  forwardTargets?: Array<{ conversationId: string; title: string; profilePic?: string }>;

  onBack?: () => void;
  showBackOnMobile?: boolean;
  onSent?: () => void;
  isAdmin?: boolean;
  sellers?: Array<{ _id?: string; id?: string; name?: string; firstName?: string; lastName?: string; email?: string }>;
  assignedSellerId?: string | null;
  deliveryStatus?: string | null;
  onUpdateMeta?: (conversationId: string, patch: { sellerId?: string | null; deliveryStatus?: string }) => void;
}) {
  const API = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  const authHeaders = useMemo(() => {
    try {
      const adminToken = localStorage.getItem("admin_token_v1") || "";
      const adminKey = localStorage.getItem("social_ai_admin_key_v1") || "";
      const sellerToken = localStorage.getItem("seller_token_v1") || "";

      // ✅ Only use admin creds on admin panel
      if (isAdmin) {
        if (adminToken) return { Authorization: `Bearer ${adminToken}` };
        if (adminKey) return { "x-admin-key": adminKey };
      }

      // ✅ Seller panel uses seller token (even if an admin token exists in storage)
      if (sellerToken) return { Authorization: `Bearer ${sellerToken}` };
    } catch {
      // ignore
    }
    return {} as Record<string, string>;
  }, [isAdmin]);;

  
  // --- Media parsing helpers (for reply preview / rendering) ---
  const toAbsoluteMediaUrl = (u: string) => {
    const url = (u || "").trim();
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("/")) return `${API}${url}`;
    return `${API}/${url}`;
  };

  const isImageUrl = (u: string) => {
    const url = u.toLowerCase();
    return (
      url.includes(".png") ||
      url.includes(".jpg") ||
      url.includes(".jpeg") ||
      url.includes(".gif") ||
      url.includes(".webp") ||
      url.includes("image/")
    );
  };

  const extractUrlsFromText = (s: string) => {
    const out: string[] = [];
    const str = String(s || "");
    // Pull urls from lines first (common saved format: "Images:\n/uploads/..")
    for (const line of str.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("/uploads/") || t.startsWith("http://") || t.startsWith("https://")) out.push(t);
    }
    // Also catch inline urls
    const reUrl = /(https?:\/\/[^\s]+|\/uploads\/[^\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = reUrl.exec(str))) out.push(m[1]);
    // de-dupe
    return Array.from(new Set(out));
  };

  const parseMediaMessage = (msg: string) => {
    const raw = String(msg || "");
    const urls = extractUrlsFromText(raw).map(toAbsoluteMediaUrl).filter(Boolean);
    const images = urls.filter(isImageUrl);
    return { images, urls, raw };
  };

const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<LiveMsg | null>(null);
  const dragStateRef = useRef<{ id: string | null; startX: number; delta: number }>({ id: null, startX: 0, delta: 0 });
  const [draggingMsgId, setDraggingMsgId] = useState<string | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState<number>(0);

// 🔎 In-chat search
const [searchOpen, setSearchOpen] = useState(false);
const [searchQ, setSearchQ] = useState("");
const [activeMatch, setActiveMatch] = useState(0);
const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});

const normalizedSearch = searchQ.trim().toLowerCase();
const matchKeys = useMemo(() => {
  if (!normalizedSearch) return [] as string[];
  const keys: string[] = [];
  messages.forEach((m, idx) => {
    const hay = String(m.message || "").toLowerCase();
    if (hay.includes(normalizedSearch)) {
      const k = String(m.id ?? (m as any).messageId ?? `${idx}-${m.timestamp ?? ""}`);
      keys.push(k);
    }
  });
  return keys;
}, [messages, normalizedSearch]);

const matchSet = useMemo(() => new Set(matchKeys), [matchKeys]);

const jumpToMatch = (i: number) => {
  if (!matchKeys.length) return;
  const next = (i + matchKeys.length) % matchKeys.length;
  setActiveMatch(next);
  const key = matchKeys[next];
  const el = msgRefs.current[key];
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
};

useEffect(() => {
  // When query changes, jump to first match
  if (normalizedSearch && matchKeys.length) {
    setActiveMatch(0);
    const el = msgRefs.current[matchKeys[0]];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (normalizedSearch && !matchKeys.length) setActiveMatch(0);
}, [normalizedSearch, matchKeys.length]);

  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [errMsg, setErrMsg] = useState<string>("");

  // ✅ Saved templates (quick replies)
  type SavedTemplate = {
    id: number;
    scope: 'global' | 'seller';
    title: string;
    type: 'text' | 'media';
    text?: string;
    mediaUrls?: string[];
    updatedAt?: any;
  };
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedErr, setSavedErr] = useState<string>("");
  const [savedQ, setSavedQ] = useState("");
  const [savedType, setSavedType] = useState<'all' | 'text' | 'media'>('all');
  const [savedItems, setSavedItems] = useState<SavedTemplate[]>([]);
  const [editItem, setEditItem] = useState<SavedTemplate | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const newFilesRef = useRef<HTMLInputElement | null>(null);

  const loadTemplates = async (opts?: { q?: string; type?: 'all' | 'text' | 'media' }) => {
    try {
      setSavedErr("");
      setSavedLoading(true);
      const q = String(opts?.q ?? savedQ).trim();
      const t = opts?.type ?? savedType;
      const usp = new URLSearchParams();
      if (q) usp.set('q', q);
      if (t !== 'all') usp.set('type', t);
      const res = await fetch(`${API}/api/templates?${usp.toString()}`, {
        headers: { ...authHeaders },
      });
      const txt = await res.text();
      if (!res.ok) {
        setSavedErr(txt || 'Failed to load templates');
        return;
      }
      const data = JSON.parse(txt || '[]');
      setSavedItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setSavedErr(e?.message || 'Failed to load templates');
    } finally {
      setSavedLoading(false);
    }
  };

  const openSaved = async () => {
    setSavedOpen(true);
    setEditItem(null);
    await loadTemplates({ q: savedQ, type: savedType });
  };

  const createTextTemplate = async () => {
    try {
      setSavedErr("");
      const title = newTitle.trim();
      const text = newText.trim();
      if (!title || !text) {
        setSavedErr('title + text required');
        return;
      }
      const res = await fetch(`${API}/api/templates/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ title, text }),
      });
      const t = await res.text();
      if (!res.ok) {
        setSavedErr(t || 'Create failed');
        return;
      }
      setNewTitle('');
      setNewText('');
      await loadTemplates();
    } catch (e: any) {
      setSavedErr(e?.message || 'Create failed');
    }
  };

  const createMediaTemplate = async () => {
    try {
      setSavedErr("");
      const title = newTitle.trim();
      if (!title) {
        setSavedErr('title required');
        return;
      }
      if (!newFiles.length) {
        setSavedErr('select at least 1 file');
        return;
      }
      const form = new FormData();
      form.append('title', title);
      newFiles.forEach((f) => form.append('files', f));
      const res = await fetch(`${API}/api/templates/media`, {
        method: 'POST',
        headers: { ...authHeaders },
        body: form,
      });
      const t = await res.text();
      if (!res.ok) {
        setSavedErr(t || 'Create failed');
        return;
      }
      setNewTitle('');
      setNewFiles([]);
      if (newFilesRef.current) newFilesRef.current.value = '';
      await loadTemplates();
    } catch (e: any) {
      setSavedErr(e?.message || 'Create failed');
    }
  };

  const updateTemplate = async (item: SavedTemplate, patch: Partial<SavedTemplate> & { mediaFiles?: File[] }) => {
    try {
      setSavedErr("");
      if (!item?.id) return;

      // If mediaFiles provided -> multipart replace
      if (patch.mediaFiles && patch.mediaFiles.length) {
        const form = new FormData();
        form.append('title', String(patch.title ?? item.title));
        patch.mediaFiles.forEach((f) => form.append('files', f));
        const res = await fetch(`${API}/api/templates/${item.id}`, {
          method: 'PUT',
          headers: { ...authHeaders },
          body: form,
        });
        const t = await res.text();
        if (!res.ok) {
          setSavedErr(t || 'Update failed');
          return;
        }
      } else {
        const res = await fetch(`${API}/api/templates/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ title: patch.title ?? item.title, text: patch.text ?? item.text, mediaUrls: patch.mediaUrls ?? item.mediaUrls }),
        });
        const t = await res.text();
        if (!res.ok) {
          setSavedErr(t || 'Update failed');
          return;
        }
      }

      setEditItem(null);
      await loadTemplates();
    } catch (e: any) {
      setSavedErr(e?.message || 'Update failed');
    }
  };

  const deleteTemplate = async (id: number) => {
    try {
      setSavedErr("");
      const res = await fetch(`${API}/api/templates/${id}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
      });
      const t = await res.text();
      if (!res.ok) {
        setSavedErr(t || 'Delete failed');
        return;
      }
      await loadTemplates();
    } catch (e: any) {
      setSavedErr(e?.message || 'Delete failed');
    }
  };

  const sendTemplate = async (tpl: SavedTemplate) => {
    if (!conversationId) {
      setSavedErr('Select a conversation first');
      return;
    }
    try {
      setSavedErr("");
      setSending(true);

      if (tpl.type === 'text') {
        const msg = String(tpl.text || '').trim();
        if (!msg) {
          setSavedErr('Template is empty');
          return;
        }
        const res = await fetch(`${API}/api/social-ai-bot/manual-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ conversationId, message: msg, replyToMessageId: (replyTo as any)?.id || null }),
        });
        const t = await res.text();
        if (!res.ok) {
          setSavedErr(t || 'Send failed');
          return;
        }
        onSent?.();
        return;
      }

      // media: download from /uploads then re-upload via existing endpoint
      const urls = Array.isArray(tpl.mediaUrls) ? tpl.mediaUrls : [];
      if (!urls.length) {
        setSavedErr('No media in template');
        return;
      }

      const blobs: File[] = [];
      for (let i = 0; i < urls.length; i++) {
        const u = String(urls[i] || '');
        const abs = u.startsWith('/uploads/') ? `${API}${u}` : u;
        const r = await fetch(abs);
        if (!r.ok) throw new Error(`Failed to fetch media (${i + 1})`);
        const b = await r.blob();
        const name = u.split('/').pop() || `file-${i + 1}`;
        blobs.push(new File([b], name, { type: b.type || 'application/octet-stream' }));
      }

      const form = new FormData();
      form.append('conversationId', conversationId);
      blobs.forEach((f) => form.append('files', f));
      const res = await fetch(`${API}/api/social-ai-bot/manual-media-reply`, {
        method: 'POST',
        headers: { ...authHeaders },
        body: form,
      });
      const t = await res.text();
      if (!res.ok) {
        setSavedErr(t || 'Send failed');
        return;
      }
      onSent?.();
    } catch (e: any) {
      setSavedErr(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  // ✅ Forward message (send an existing bubble to another conversation)
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<LiveMsg | null>(null);
  const [forwardTargetId, setForwardTargetId] = useState<string>("");
  const [forwardSending, setForwardSending] = useState(false);
  const [forwardError, setForwardError] = useState<string>("");

  // ✅ Media preview (lightbox)
  type PreviewItem = { url: string; type: 'image' | 'video' };
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);
  const openPreview = (url: string, type: PreviewItem['type']) => setPreviewItem({ url, type });
  const closePreview = () => setPreviewItem(null);

  const openForward = (m: LiveMsg) => {
    setForwardError("");
    setForwardMsg(m);
    // preselect the first other conversation if available
    const first = (forwardTargets || []).find((x) => x?.conversationId && x.conversationId !== conversationId);
    setForwardTargetId(String(first?.conversationId || ""));
    setForwardOpen(true);
  };

  const doForward = async () => {
    if (!forwardMsg || !forwardTargetId) return;
    try {
      setForwardError("");
      setForwardSending(true);
      const res = await fetch(`${API}/api/social-ai-bot/forward-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ targetConversationId: forwardTargetId, message: forwardMsg.message || "" }),
      });
      if (!res.ok) {
        const t = await res.text();
        setForwardError(t || "Forward failed");
        return;
      }
      setForwardOpen(false);
      setForwardMsg(null);
      setForwardTargetId("");
    } catch (e: any) {
      setForwardError(e?.message || "Forward failed");
    } finally {
      setForwardSending(false);
    }
  };


  const listRef = useRef<HTMLDivElement | null>(null);

  // ✅ Extract ALL URLs from message text
  const extractAllUrls = (t: string) => {
    if (!t) return [];

    // Clean up URLs that come with quotes, commas, brackets, etc.
    // This commonly happens when URLs are joined with punctuation or stored as JSON-like arrays.
    const sanitizeUrl = (u: string) =>
      String(u || "")
        .trim()
        // leading wrappers
        .replace(/^["'\(\[]+/, "")
        // trailing wrappers/punctuation (comma, quote, bracket, paren, dot)
        .replace(/[\]\)"',\.]+$/, "");

    // Some payloads join multiple URLs with commas (no spaces). Split them.
    const splitAndSanitizeUrls = (s: string) =>
      String(s || "")
        .split(",")
        .map((x) => sanitizeUrl(x))
        .filter(Boolean);
    
    // Handle "📷 Images:" format
    if (t.startsWith("📷 Images:")) {
      return t
        .split("\n")
        .slice(1)
        .flatMap((s) => splitAndSanitizeUrls(s));
    }
    
    // Handle "📷 Image:" format
    if (t.includes("📷 Image:")) {
      const part = t.split("📷 Image:")[1]?.trim() || "";
      return splitAndSanitizeUrls(part);
    }
    
    // Handle "🎥 Video:" format
    if (t.startsWith("🎥 Video:")) {
      const part = t.split("🎥 Video:")[1]?.trim() || "";
      return splitAndSanitizeUrls(part);
    }

    // Handle "🎥 Videos:" format (multiple videos in one bubble)
    if (t.startsWith("🎥 Videos:")) {
      return t
        .split("\n")
        .slice(1)
        .flatMap((s) => splitAndSanitizeUrls(s));
    }

    // Handle "📎 Attachments:" format (mixed media in one bubble)
    if (t.startsWith("📎 Attachments:")) {
      return t
        .split("\n")
        .slice(1)
        .flatMap((s) => splitAndSanitizeUrls(s));
    }
    
    // Extract all absolute URLs and our relative uploads paths from text
    // - absolute: https?://...
    // - relative: /uploads/...
    const matches = t.match(/(https?:\/\/\S+|\/uploads\/[^\s]+)/g);
    return (matches || []).flatMap((x) => splitAndSanitizeUrls(x));
  };

  // Normalize media URLs so the panel can fetch them reliably.
  // If a message stores a relative `/uploads/...`, we fetch from backend API base.
  const normalizeMediaUrl = (url: string) => {
    if (!url) return url;

    // Relative uploads -> keep relative so Next.js can proxy `/uploads/*` via rewrites
    if (url.startsWith('/uploads/')) {
      return url;
    }

    // If someone accidentally stored UI-origin uploads URLs, swap to API base.
    // (common when UI is exposed via ngrok on :3000 but backend is :5000)
    try {
      const u = new URL(url);
      const api = new URL(API);
      if (u.pathname.startsWith('/uploads/') && u.origin === window.location.origin && api.origin !== u.origin) {
        // Swap to relative to allow Next rewrite/proxy
        return `${u.pathname}${u.search}`;
      }
    } catch {
      // ignore
    }

    return url;
  };

  // ✅ Check if URL is probably an image
  const isProbablyImageUrl = (url: string) => {
    if (!url) return false;

    // fb/ig cdn
    if (url.includes("fbcdn.net") || url.includes("scontent")) return true;

    // our uploads (ngrok/local)
    if (url.includes("/uploads/")) return true;

    // normal extensions
    return /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);
  };

  // ✅ Check if URL is probably a video
  const isProbablyVideoUrl = (url: string) => {
    if (!url) return false;
    return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
  };

  // ✅ Separate URLs into media items with type
  const categorizeMediaUrls = (t: string) => {
    const urls = extractAllUrls(t);
    const media: Array<{ url: string; type: 'image' | 'video' }> = [];

    urls.forEach((url) => {
      const fixedUrl = normalizeMediaUrl(url);
      if (isProbablyVideoUrl(fixedUrl)) {
        media.push({ url: fixedUrl, type: 'video' });
      } else if (isProbablyImageUrl(fixedUrl)) {
        media.push({ url: fixedUrl, type: 'image' });
      }
    });

    return media;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSendText = async () => {
    const msg = text.trim();
    if (!msg || !conversationId) return;

    try {
      setErrMsg("");
      setSending(true);

      const res = await fetch(`${API}/api/social-ai-bot/manual-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ conversationId, message: msg, replyToMessageId: (replyTo as any)?.id || null }),
      });

      if (!res.ok) {
        const t = await res.text();
        console.error("manual-reply failed:", t);
        setErrMsg(t || "Send failed");
        return;
      }

      setText("");
        setReplyTo(null);
      onSent?.();
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async () => {
    if (!conversationId || files.length === 0) return;

    try {
      setErrMsg("");
      setSending(true);

      const form = new FormData();
      form.append("conversationId", conversationId);
      // ✅ multiple append
      files.forEach((f) => form.append("files", f));

      const res = await fetch(`${API}/api/social-ai-bot/manual-media-reply`, {
        method: "POST",
        headers: { ...authHeaders },
        body: form,
      });

      const body = await res.text();
      if (!res.ok) {
        console.error("manual-media-reply failed:", body);
        setErrMsg(body || "Media send failed");
        return;
      }

      setFiles([]);
        setReplyTo(null);
      onSent?.();
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message || "Media send failed");
    } finally {
      setSending(false);
    }
  };

  const smartSend = () => {
    if (sending) return;
    if (files.length > 0) return handleSendMedia();
    return handleSendText();
  };

  const headerId = useMemo(() => conversationId || "", [conversationId]);

  const msgById = useMemo(() => {
    const map = new Map<string, LiveMsg>();
    for (const m of messages || []) {
      if ((m as any)?.id != null) map.set(String((m as any).id), m);
    }
    return map;
  }, [messages]);

  const sellerLabel = (s: any) => {
    const full = [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim();
    return full || s?.name || s?.email || "Seller";
  };

  const assignedSellerName = (sellerId?: string | null) => {
    if (!sellerId) return "Unassigned";
    const s = (sellers || []).find((x) => String(x?._id || x?.id) === String(sellerId));
    return s ? sellerLabel(s) : "Seller";
  };

  const statusLabel = (v?: string | null) => {
    const x = String(v || 'confirmed');
    if (x === 'delivered') return 'delivered';
    if (x === 'cancel') return 'cancel';
    return x;
  };

  // ✅ Local editor for a saved item
  const EditSavedItem = ({
    item,
    onSave,
    onClose,
  }: {
    API: string;
    authHeaders: Record<string, string>;
    item: SavedTemplate;
    onSave: (patch: Partial<SavedTemplate> & { mediaFiles?: File[] }) => void;
    onClose: () => void;
  }) => {
    const [title, setTitle] = useState<string>(String(item.title || ""));
    const [txt, setTxt] = useState<string>(String(item.text || ""));
    const [mediaUrls, setMediaUrls] = useState<string[]>(Array.isArray(item.mediaUrls) ? item.mediaUrls.map(String) : []);
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const replRef = useRef<HTMLInputElement | null>(null);

    return (
      <div className="mt-3 rounded-xl border border-gray-200 p-3">
        {/* Keep edit fields compact (50% on desktop, full on mobile) */}
        <div className="w-full md:w-1/2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 w-full rounded-md border border-gray-300 px-2 text-sm"
            placeholder="title"
          />
        </div>

        {item.type === 'text' ? (
          <textarea
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            className="mt-2 w-full md:w-1/2 min-h-[90px] rounded-md border border-gray-300 p-2 text-sm"
            placeholder="text"
          />
        ) : (
          <div className="mt-2">
            <div className="text-xs text-gray-600 mb-1">Current media</div>
            {mediaUrls.length ? (
              <div className="space-y-1">
                {mediaUrls.map((u, idx) => (
                  <div key={`murl-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                    <div className="truncate text-gray-700 flex-1">{u}</div>
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded-md border border-gray-300 hover:bg-gray-50"
                      onClick={() => setMediaUrls(mediaUrls.filter((_, i) => i !== idx))}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No media URLs</div>
            )}

            <input
              ref={replRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => setMediaFiles(Array.from(e.target.files || []))}
            />
            <div className="mt-2 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                className="h-9 px-3 rounded-md border border-black bg-white text-sm hover:bg-gray-100"
                onClick={() => replRef.current?.click()}
              >
                Replace files
              </button>
              {mediaFiles.length ? (
                <div className="text-xs text-gray-600">selected: {mediaFiles.length} file(s)</div>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-black bg-white text-sm hover:bg-gray-100"
            onClick={() =>
              onSave({
                title,
                text: item.type === 'text' ? txt : undefined,
                mediaUrls: item.type === 'media' ? mediaUrls : undefined,
                mediaFiles: item.type === 'media' ? mediaFiles : undefined,
              })
            }
          >
            Save
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm hover:bg-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-full min-h-0 flex flex-col">
      {/* Customer ID show Header */}
      <div className="border-b border-[#000000]">


        {/* This code for ui comment 
        <p className="text-[#adadad] truncate">This section code path is--social-ai-ui/src/ChatWindow.tsx</p>
        */}


        <div className="px-4 py-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
              {profilePic ? (
                <img src={profilePic} alt={title || "Customer"} className="w-full h-full object-cover" />
              ) : null}
            </div>
              <div className="text-[#1a070d] font-semibold text-xl truncate">
                {title || headerId}
              </div>
            </div>

            {/* ✅ Admin-only: Actions menu moved to inbox header (next to customer name) */}
            {isAdmin && conversationId ? (
              <div className="shrink-0" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <select
                  className={[
                    "h-10 min-w-[160px] rounded-md bg-white px-2 text-xs",
                    "border border-gray-300 shadow-sm",
                    "focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400",
                  ].join(" ")}
                  value=""
                  onChange={(e) => {
                    const v = String(e.target.value || "");
                    (e.target as HTMLSelectElement).value = "";

                    if (!v) return;
                    if (v === "unassign") {
                      onUpdateMeta?.(conversationId, { sellerId: null });
                      return;
                    }
                    if (v.startsWith("assign:")) {
                      const id = v.slice("assign:".length);
                      onUpdateMeta?.(conversationId, { sellerId: id || null });
                      return;
                    }
                  }}
                >
                  <option key="placeholder" value="">
                    Actions…
                  </option>

                  {(sellers || [])
                    .map((s: any, idx: number) => ({ s, idx, sid: String(s?._id || s?.id || "") }))
                    .filter((x) => !!x.sid)
                    .map(({ s, idx, sid }) => (
                      <option key={`assign-${sid}-${idx}`} value={`assign:${sid}`}>
                        Assign : {sellerLabel(s)}
                      </option>
                    ))}

                  <option key="unassign" value="unassign">
                    Unassign ({assignedSellerName(assignedSellerId)})
                  </option>
                </select>
              </div>
            ) : null}

            {/* ✅ Seller-only: Status menu moved to inbox header (next to customer name) */}
            {!isAdmin && conversationId ? (
              <div className="shrink-0" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <select
                  className={[
                    "h-10 min-w-[160px] rounded-md bg-white px-2 text-xs",
                    "border border-gray-300 shadow-sm",
                    "focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400",
                  ].join(" ")}
                  value=""
                  onChange={(e) => {
                    const v = String(e.target.value || "");
                    (e.target as HTMLSelectElement).value = "";
                    if (!v) return;
                    if (v.startsWith("status:")) {
                      const st = v.slice("status:".length);
                      onUpdateMeta?.(conversationId, { deliveryStatus: st });
                    }
                  }}
                >
                  <option key="placeholder" value="">
                    Status ({statusLabel(deliveryStatus)})
                  </option>
                  <option key="status-confirmed" value="status:confirmed">confirmed</option>
                  <option key="status-hold" value="status:hold">hold</option>
                  <option key="status-delivered" value="status:delivered">delivered</option>
                  <option key="status-cancel" value="status:cancel">cancel</option>
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      

      

      {/* ✅ Media preview modal */}
      {previewItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onMouseDown={() => closePreview()}
        >
          <div
            className="relative w-full max-w-5xl rounded-2xl bg-white border-2 border-black p-3"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-2 right-2 px-3 py-1 rounded-lg border border-black bg-white text-sm hover:bg-gray-100"
              onClick={() => closePreview()}
            >
              Close
            </button>

            <div className="w-full flex items-center justify-center">
              {previewItem.type === 'video' ? (
                <video
                  src={previewItem.url}
                  controls
                  className="max-h-[80vh] w-auto max-w-[92vw] rounded-xl border border-black object-contain"
                />
              ) : (
                <img
                  src={previewItem.url}
                  alt="preview"
                  className="max-h-[80vh] w-auto max-w-[92vw] rounded-xl border border-black object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ Saved templates (Quick Reply) panel: bottom sheet (does NOT cover the full screen) */}
      {savedOpen ? (
        <div className="absolute inset-0 z-50">
          {/* Backdrop (only covers chat pane) */}
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => {
              if (sending) return;
              setSavedOpen(false);
              setEditItem(null);
            }}
          />

          {/* Bottom sheet */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-3 flex justify-center">

            <div className="w-full md:w-1/2 h-[50vh] md:h-[45vh] overflow-hidden rounded-2xl bg-white border-2 border-black shadow-2xl flex flex-col">

            <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-200 shrink-0">
              <div className="text-lg font-semibold">Saved items</div>
              <button
                type="button"
                className="px-3 py-1 rounded-lg border border-black bg-white text-sm hover:bg-gray-100"
                onClick={() => {
                  if (sending) return;
                  setSavedOpen(false);
                  setEditItem(null);
                }}
              >
                Close
              </button>
            </div>

            {/* Body (scrolls). Keep header fixed */}
            <div className="p-4 flex-1 min-h-0 overflow-y-auto">
	              <div className="flex flex-wrap items-center gap-2">
              <input
                value={savedQ}
                onChange={(e) => setSavedQ(e.target.value)}
                placeholder="search..."
                className="h-10 flex-1 min-w-[180px] rounded-md border border-gray-300 px-2 text-sm"
              />
              <select
                className="h-10 rounded-md border border-gray-300 px-2 text-sm"
                value={savedType}
                onChange={(e) => setSavedType(e.target.value as any)}
              >
                <option value="all">All</option>
                <option value="text">Text</option>
                <option value="media">Media</option>
              </select>
              <button
                type="button"
                className="h-10 px-3 rounded-md border border-black bg-white text-sm hover:bg-gray-100"
                onClick={() => loadTemplates({ q: savedQ, type: savedType })}
                disabled={savedLoading}
              >
                Refresh
              </button>
            </div>

	            {savedErr ? <div className="mt-2 text-sm text-red-600">{savedErr}</div> : null}

            {/* Create new */}
            <div className="mt-4 rounded-xl border border-gray-200 p-3">
              <div className="text-sm font-semibold mb-2">Create new</div>
	              {/* Keep input area visually compact (50% on desktop, full on mobile) */}
	              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
	                <div className="w-full">
	                  <input
	                    value={newTitle}
	                    onChange={(e) => setNewTitle(e.target.value)}
	                    placeholder="title"
	                    className="h-10 w-full rounded-md border border-gray-300 px-2 text-sm"
	                  />
	                  <textarea
	                    value={newText}
	                    onChange={(e) => setNewText(e.target.value)}
	                    placeholder="text (leave empty if you are saving media)"
	                    className="mt-2 w-full min-h-[90px] rounded-md border border-gray-300 p-2 text-sm"
	                  />
	                </div>

	                <div className="w-full flex flex-col items-start gap-2">
	                  <input
                  ref={newFilesRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                />
	                  <button
                  type="button"
                  className="h-10 px-3 rounded-md border border-black bg-white text-sm hover:bg-gray-100"
                  onClick={() => newFilesRef.current?.click()}
                >
                  Add media
                </button>
	                </div>
	              </div>

              {newFiles.length ? (
                <div className="mt-2 text-xs text-gray-600">
                  selected: {newFiles.length} file(s)
                  <button className="ml-2 underline" onClick={() => {
                    setNewFiles([]);
                    if (newFilesRef.current) newFilesRef.current.value = '';
                  }}>clear</button>
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="h-10 px-3 rounded-md border border-black bg-white text-sm hover:bg-gray-100"
                  onClick={createTextTemplate}
                  disabled={savedLoading}
                >
                  Save text
                </button>
                <button
                  type="button"
                  className="h-10 px-3 rounded-md border border-black bg-white text-sm hover:bg-gray-100"
                  onClick={createMediaTemplate}
                  disabled={savedLoading}
                >
                  Save media
                </button>
              </div>
            </div>

            {/* List */}
	            <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
	              <div className="max-h-[45vh] overflow-auto">
              {savedLoading ? (
                <div className="p-3 text-sm text-gray-600">Loading...</div>
              ) : savedItems.length === 0 ? (
                <div className="p-3 text-sm text-gray-600">No saved items</div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {savedItems.map((it) => {
                    const isEditing = editItem?.id === it.id;
                    const isText = it.type === 'text';
                    return (
                      <div key={it.id} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{it.title}</div>
                            <div className="text-xs text-gray-600">{it.type} • {it.scope}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 shrink-0">
                            <button
                              type="button"
                              className="h-9 px-3 rounded-md border border-black bg-white text-sm hover:bg-gray-100"
                              onClick={() => sendTemplate(it)}
                              disabled={!conversationId || sending}
                            >
                              Send
                            </button>
                            <button
                              type="button"
                              className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm hover:bg-gray-100"
                              onClick={() => setEditItem(isEditing ? null : it)}
                            >
                              {isEditing ? 'Cancel' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              className="h-9 px-3 rounded-md border border-red-400 bg-white text-sm hover:bg-red-50"
                              onClick={() => {
                                if (confirm('Delete this saved item?')) deleteTemplate(it.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* preview */}
                        {!isEditing ? (
                          <div className="mt-2">
                            {isText ? (
                              <div className="text-sm whitespace-pre-wrap break-words text-gray-800 border border-gray-100 rounded-md p-2 bg-gray-50">
                                {String(it.text || '')}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                {(it.mediaUrls || []).slice(0, 4).map((u, idx) => {
                                  const url = String(u || '');
                                  const isVid = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
                                  const src = url.startsWith('/uploads/') ? `${API}${url}` : url;
                                  return isVid ? (
                                    <video key={`${it.id}-m-${idx}`} src={src} controls className="w-full max-h-40 rounded-lg border border-black object-contain bg-white" />
                                  ) : (
                                    <img key={`${it.id}-m-${idx}`} src={src} className="w-full max-h-40 rounded-lg border border-black object-contain bg-white" />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <EditSavedItem
                            API={API}
                            authHeaders={authHeaders}
                            item={it}
                            onSave={(patch) => updateTemplate(it, patch)}
                            onClose={() => setEditItem(null)}
                          />
                        )}
                      </div>
                    );
                  })}
	                </div>
	              )}
	              </div>
	            </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ Forward modal */}
      {forwardOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={() => {
            if (!forwardSending) {
              setForwardOpen(false);
              setForwardMsg(null);
              setForwardTargetId("");
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white border-2 border-black p-4"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold mb-2">Forward message</div>

            <div className="text-xs text-gray-600 mb-3 whitespace-pre-wrap max-h-24 overflow-auto border border-gray-200 rounded-md p-2">
              {forwardMsg?.message || ""}
            </div>

            <label className="block text-sm font-medium mb-1">Send to</label>
            <select
              className="w-full h-10 rounded-md border border-gray-300 px-2 text-sm"
              value={forwardTargetId}
              onChange={(e) => setForwardTargetId(String(e.target.value || ""))}
              disabled={forwardSending}
            >
              {(forwardTargets || [])
                .filter((x) => x?.conversationId && x.conversationId !== conversationId)
                .map((x) => (
                  <option key={x.conversationId} value={x.conversationId}>
                    {x.title || x.conversationId}
                  </option>
                ))}
            </select>

            {forwardError ? <div className="mt-2 text-sm text-red-600 whitespace-pre-wrap">{forwardError}</div> : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-10 px-4 rounded-md border border-gray-300"
                onClick={() => {
                  setForwardOpen(false);
                  setForwardMsg(null);
                  setForwardTargetId("");
                }}
                disabled={forwardSending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-10 px-4 rounded-md bg-black text-white disabled:opacity-60"
                onClick={doForward}
                disabled={forwardSending || !forwardTargetId || !forwardMsg}
              >
                {forwardSending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Customer Messages Box */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-auto px-4 py-4 md:px-8 md:py-6">
        <div className="space-y-6">
          {messages.map((m, idx) => {
            const msgKey = String(m.id ?? (m as any).messageId ?? `${idx}-${m.timestamp ?? ""}`);
            const isMatch = normalizedSearch ? matchSet.has(msgKey) : false;
            const isActive = normalizedSearch && matchKeys.length ? msgKey === matchKeys[activeMatch] : false;
            const isBot = m.sender === "bot";
            const time = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";

            const senderLabel = (() => {
              if (!isBot) {
                return (m.senderName || m.customerName || title || "Customer").trim();
              }

              // Prefer explicit senderName from backend for admin/seller messages.
              if (m.senderName) return String(m.senderName).trim();

              // Backward compatible fallback for old rows
              if (m.senderRole === "admin") return "Admin";
              if (m.senderRole === "seller") return "Seller";
              if (m.senderRole === "ai") return "AI Bot";

              // Legacy behavior: bot messages in admin panel were labelled "admin".
              return isAdmin ? "Admin" : "Seller";
            })();

            // ✅ Get all media items (images and videos mixed)
            const media = categorizeMediaUrls(m.message || "");
            const hasMedia = media.length > 0;

            // ✅ Extract text without media markers
            let displayText = m.message || "";
            if (
              displayText.startsWith("📷 Images:") ||
              displayText.startsWith("🎥 Video:") ||
              displayText.startsWith("🎥 Videos:") ||
              displayText.startsWith("📎 Attachments:")
            ) {
              displayText = ""; // Don't show the marker text
            } else if (displayText.includes("📷 Image:")) {
              displayText = displayText.split("📷 Image:")[0]?.trim() || "";
            }

            // ✅ If the message mostly contains media URLs (common for forwarded media),
            // hide the raw URL text and only show the media preview grid.
            if (hasMedia && displayText) {
              const urls = extractAllUrls(displayText);
              if (urls.length > 0) {
                let stripped = displayText;
                urls.forEach((u) => {
                  // Remove both raw and normalized variants if present
                  stripped = stripped.split(u).join("");
                });
                // Remove leftover punctuation/labels/newlines
                stripped = stripped
                  .replace(/\bhttps?:\/\/\S+\b/g, "")
                  .replace(/\(\s*\)/g, "")
                  .replace(/[\s\n\r\t]+/g, " ")
                  .replace(/[:\-–—•]+/g, " ")
                  .trim();

                if (!stripped) {
                  displayText = "";
                } else {
                  displayText = stripped;
                }
              }
            }

            return (
              <div
                key={msgKey}
                ref={(el) => {
                  if (el) msgRefs.current[msgKey] = el;
                  else delete msgRefs.current[msgKey];
                }}
                className={["w-full flex items-start gap-2", isBot ? "justify-end" : "justify-start"].join(" ")}
              >
                {isBot ? (
                  <button
                    type="button"
                    className="shrink-0 mt-2 text-[14px] text-gray-700 hover:text-black"
                    onClick={() => setReplyTo(m)}
                    title="Reply"
                  >
                    ↩
                  </button>
                ) : null}
                <div
                  onPointerDown={(e) => {
                    // If user is interacting with a button/link/input (e.g., forward/reply), don't start swipe-to-reply.
                    const t = e.target as HTMLElement | null;
                    if (t && t.closest("button, a, input, textarea, select, [role='button']")) return;

                    // Ignore non-primary button drags on desktop
                    // (touch has button === -1 in many browsers)
                    if (typeof (e as any).button === "number" && (e as any).button > 0) return;
                    dragStateRef.current = { id: msgKey, startX: e.clientX, delta: 0 };
                    setDraggingMsgId(msgKey);
                    setDragDeltaX(0);
                    try {
                      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
                    } catch {}
                  }}
                  onPointerMove={(e) => {
                    if (dragStateRef.current.id !== msgKey) return;
                    const dx = e.clientX - dragStateRef.current.startX;

                    // WhatsApp-like: swipe RIGHT to reply on incoming; swipe LEFT to reply on outgoing.
                    const unclamped = isBot ? Math.min(0, dx) : Math.max(0, dx);
                    const clamped = Math.max(-80, Math.min(80, unclamped));

                    dragStateRef.current.delta = clamped;
                    setDragDeltaX(clamped);
                  }}
                  onPointerUp={() => {
                    if (dragStateRef.current.id !== msgKey) return;
                    const delta = dragStateRef.current.delta;
                    const threshold = 60;

                    const shouldReply = (!isBot && delta > threshold) || (isBot && delta < -threshold);
                    dragStateRef.current = { id: null, startX: 0, delta: 0 };
                    setDraggingMsgId(null);
                    setDragDeltaX(0);

                    if (shouldReply) setReplyTo(m);
                  }}
                  onPointerCancel={() => {
                    if (dragStateRef.current.id !== msgKey) return;
                    dragStateRef.current = { id: null, startX: 0, delta: 0 };
                    setDraggingMsgId(null);
                    setDragDeltaX(0);
                  }}
                  style={msgKey === draggingMsgId ? { transform: `translateX(${dragDeltaX}px)` } : undefined}
                  className={[                    "max-w-[780px] px-5 py-4 text-sm leading-relaxed",

                    "max-w-[780px] px-5 py-4 text-sm leading-relaxed",
                    "border-2 border-black rounded-xl bg-white",
                    isMatch ? "outline outline-4 outline-yellow-300" : "",
                    isActive ? "outline-yellow-500" : "",
                    "transition-colors duration-150 hover:bg-gray-50",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div className="text-[12px] font-medium">{senderLabel}</div>
                    <div className="flex items-center gap-3">
                      {conversationId && (forwardTargets || []).length > 1 ? (
                        <button
                          type="button"
                          className="text-[11px] underline text-gray-700 hover:text-black"
                          onClick={() => openForward(m)}
                        >
                          forward
                        </button>
                      ) : null}
<div className="text-[11px] text-gray-500">{time}</div>
                    </div>
                  </div>


                  {m.replyToMessageId ? (() => {
                    const ref = msgById.get(String(m.replyToMessageId));
                    if (!ref) return null;
                    const refIsBot = ref.sender === "bot";
                    const refLabel = (() => {
                      if (!refIsBot) return (ref.senderName || ref.customerName || title || "Customer").trim();
                      if (ref.senderName) return String(ref.senderName).trim();
                      if (ref.senderRole === "admin") return "Admin";
                      if (ref.senderRole === "seller") return "Seller";
                      if (ref.senderRole === "ai") return "AI Bot";
                      return isAdmin ? "Admin" : "Seller";
                    })();
                    const refMedia = parseMediaMessage(String(ref.message || ""));
                    const refText = String(ref.message || "").replace(/\s+/g, " ").trim();
                    return (
                      <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-semibold text-gray-700">{refLabel}</div>

                        {refMedia.images.length > 0 ? (
                          <div className="mt-2 flex items-center gap-2 overflow-hidden">
                            {refMedia.images.slice(0, 3).map((u, i) => (
                              <img
                                key={`${u}-${i}`}
                                src={u}
                                alt="replied media"
                                className="h-10 w-10 rounded-md border border-gray-200 object-cover bg-white"
                                loading="lazy"
                              />
                            ))}
                            {refMedia.images.length > 3 ? (
                              <div className="text-[11px] text-gray-500">+{refMedia.images.length - 3}</div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-[12px] text-gray-600 truncate">{refText}</div>
                        )}
                      </div>
                    );
                  })() : null}

                  {/* ✅ Display text if available */}
                  {displayText && (
                    <div className="whitespace-pre-wrap mb-3">{displayText}</div>
                  )}

                  {/* ✅ Display all media (images and videos) in same grid */}
                  {media.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {media.map((item, i) => (
                        <div key={`${item.url}-${i}`} className="w-full">
                          {item.type === 'video' ? (
                            <div className="w-full">
                              <video
                                src={item.url}
                                controls
                                className="w-full max-h-64 rounded-lg border border-black object-contain bg-white"
                              />
                              <button
                                type="button"
                                className="mt-1 text-[11px] underline text-gray-700 hover:text-black"
                                onClick={() => openPreview(item.url, 'video')}
                              >
                                preview
                              </button>
                            </div>
                          ) : (
                            <img
                              src={item.url}
                              alt={`attachment-${i + 1}`}
                              className="w-full max-h-64 rounded-lg border border-black object-contain bg-white cursor-zoom-in"
                              onClick={() => openPreview(item.url, 'image')}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ✅ If no media and no display text, show original message */}
                  {!hasMedia && !displayText && (
                    <div className="whitespace-pre-wrap">{m.message}</div>
                  )}
                </div>
                {!isBot ? (
                  <button
                    type="button"
                    className="shrink-0 mt-2 text-[14px] text-gray-700 hover:text-black"
                    onClick={() => setReplyTo(m)}
                    title="Reply"
                  >
                    ↪
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="w-full border-t-2 border-black" />

      {/* 🔎 Search bar */}
{searchOpen ? (
  <div className="px-4 md:px-16 pt-3">
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-white rounded-full border-2 border-black px-4 py-2 flex items-center gap-2">
        <span className="text-sm">🔎</span>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") jumpToMatch(0);
            if (e.key === "Escape") {
              setSearchOpen(false);
              setSearchQ("");
            }
          }}
          placeholder="Search messages in this chat…"
          className="flex-1 outline-none text-sm"
        />
        {normalizedSearch ? (
          <span className="text-xs text-gray-600 whitespace-nowrap">
            {matchKeys.length ? `${activeMatch + 1}/${matchKeys.length}` : "0/0"}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className="w-10 h-10 rounded-full border-2 border-black bg-white flex items-center justify-center disabled:opacity-50"
        title="Previous match"
        disabled={!matchKeys.length}
        onClick={() => jumpToMatch(activeMatch - 1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="w-10 h-10 rounded-full border-2 border-black bg-white flex items-center justify-center disabled:opacity-50"
        title="Next match"
        disabled={!matchKeys.length}
        onClick={() => jumpToMatch(activeMatch + 1)}
      >
        ›
      </button>

      <button
        type="button"
        className="w-10 h-10 rounded-full border-2 border-black bg-white flex items-center justify-center"
        title="Close search"
        onClick={() => {
          setSearchOpen(false);
          setSearchQ("");
        }}
      >
        ✕
      </button>
    </div>
  </div>
) : null}

{/* Reply preview (WhatsApp/Facebook style) */}
{replyTo ? (
  <div className="px-4 md:px-16 pt-3">
    <div className="rounded-2xl border-2 border-black bg-white px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-800">
          You replied to {(replyTo.sender === "customer"
            ? (replyTo.senderName || replyTo.customerName || title || "Customer")
            : (replyTo.senderName || (replyTo.senderRole === "admin" ? "Admin" : replyTo.senderRole === "seller" ? "Seller" : replyTo.senderRole === "ai" ? "AI Bot" : "Agent"))
          )}
        </div>
        {(() => {
          const pm = parseMediaMessage(String(replyTo.message || ""));
          if (pm.images.length > 0) {
            return (
              <div className="mt-2 flex items-center gap-2 overflow-x-auto">
                {pm.images.slice(0, 4).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src + i}
                    src={src}
                    alt="reply preview"
                    className="w-12 h-12 rounded-xl border-2 border-black object-cover flex-shrink-0"
                  />
                ))}
                {pm.images.length > 4 ? (
                  <div className="text-xs text-gray-600 whitespace-nowrap">+{pm.images.length - 4} more</div>
                ) : null}
              </div>
            );
          }
          return (
            <div className="text-xs text-gray-600 truncate mt-1">
              {String(replyTo.message || "").replace(/\s+/g, " ").trim()}
            </div>
          );
        })()}
      </div>
      <button
        type="button"
        className="w-8 h-8 rounded-full border-2 border-black bg-white flex items-center justify-center"
        title="Cancel reply"
        onClick={() => setReplyTo(null)}
      >
        ✕
      </button>
    </div>
  </div>
) : null}

{/* Bottom pill input (like screenshot) */}
      <div className="px-4 md:px-16 pb-4 md:pb-6">
        <div className="bg-[#2b2b2b] rounded-full px-4 py-3 flex items-center gap-3 shadow-inner">
          {/* hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            disabled={!conversationId || sending}
          />

          {/* + */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!conversationId || sending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-2xl hover:bg-[#3a3a3a] disabled:opacity-50"
            title="Attach"
          >
            +
          </button>


          
{/* input */}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") smartSend();
            }}
            placeholder={files.length ? `selected: ${files.length} file(s)` : "type your message"}
            disabled={!conversationId || sending}
            className="flex-1 bg-transparent outline-none text-white placeholder-gray-400 text-base"
          />

          {/* saved */}
          <button
            type="button"
            onClick={openSaved}
            disabled={sending}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg hover:bg-[#3a3a3a] disabled:opacity-50"
            title="Saved"
          >
            ★
          </button>

{/* search */}
<button
  type="button"
  onClick={() => {
    setSearchOpen(true);
    // If user typed something in the message box and search is empty, use that as initial query.
    // (Does not clear the message draft.)
    if (!searchQ.trim() && text.trim()) setSearchQ(text.trim());
  }}
  disabled={!conversationId}
  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg hover:bg-[#3a3a3a] disabled:opacity-50"
  title="Search in chat"
>
  🔎
</button>

          {/* send */}
          <button
            type="button"
            onClick={smartSend}
            disabled={!conversationId || sending || (!text.trim() && files.length === 0)}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center disabled:opacity-50"
            title="Send"
          >
            ↑
          </button>
        </div>

        {/* file + error */}
        {files.length > 0 && (
          <div className="mt-2 text-sm text-gray-400">
            Selected: <span className="font-medium">{files.length} file(s)</span>
            <button type="button" className="ml-2 underline" onClick={() => setFiles([])}>
              remove
            </button>
          </div>
        )}

        {errMsg && (
          <div className="mt-2 text-sm text-red-600">
            {errMsg}
          </div>
        )}
      </div>
    </div>
  );
}