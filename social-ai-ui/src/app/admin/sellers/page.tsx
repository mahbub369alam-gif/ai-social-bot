"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * ✅ Admin Seller Management
 * - Data is saved in MongoDB via backend API.
 * - Admin endpoints require header: x-admin-key (matches backend ADMIN_API_KEY).
 */

type ApiSeller = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

const ADMIN_KEY_LS = "social_ai_admin_key_v1";

function buildAdminHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("admin_token_v1") || "";
  if (token) return { Authorization: `Bearer ${token}` };
  const key = window.localStorage.getItem(ADMIN_KEY_LS) || "";
  return key ? { "x-admin-key": key } : {};
}

function genPassword() {
  return Math.random().toString(36).slice(2, 10);
}

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

export default function SellersPage() {
  const API_BASE = useMemo(
    () => process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000",
    []
  );

  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(ADMIN_KEY_LS) || "";
  });

  const [sellers, setSellers] = useState<ApiSeller[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [open, setOpen] = useState(false);

  // form (আগের UI-ই রেখে দিলাম)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(
    undefined
  );
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const header = useMemo(() => `👨‍💼 Create Seller`, []);

  const persistAdminKey = (val: string) => {
    setAdminKey(val);
    try {
      localStorage.setItem(ADMIN_KEY_LS, val);
    } catch {
      // ignore
    }
  };

  const fetchSellers = async () => {
    setErr("");
    setLoadingList(true);
    try {
      const headersBase = buildAdminHeaders();
      if (!headersBase.Authorization && !headersBase["x-admin-key"]) {
        throw new Error("Admin login করুন অথবা Admin API Key দিন (backend .env এর ADMIN_API_KEY)");
      }

      const res = await fetch(`${API_BASE}/api/sellers`, {
        method: "GET",
        headers: { ...headersBase },
        cache: "no-store",
      });

      if (!res.ok) {
        const msg = await safeReadJsonMessage(res);
        throw new Error(msg || `Failed to load sellers (${res.status})`);
      }

      const data = (await res.json()) as ApiSeller[];
      setSellers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load sellers");
    } finally {
      setLoadingList(false);
    }
  };

  const deleteSeller = async (id: string) => {
    try {
      setErr("");
      const headersBase = buildAdminHeaders();
      if (!headersBase.Authorization && !headersBase["x-admin-key"]) {
        throw new Error("Admin login করুন অথবা Admin API Key দিন");
      }

      const ok = confirm("Are you sure? This seller will be deactivated and removed from list.");
      if (!ok) return;

      const res = await fetch(`${API_BASE}/api/sellers/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { ...headersBase },
      });
      if (!res.ok) {
        const msg = await safeReadJsonMessage(res);
        throw new Error(msg || `Delete failed (${res.status})`);
      }
      await fetchSellers();
    } catch (e: any) {
      setErr(e?.message || "Failed to delete seller");
    }
  };

  useEffect(() => {
    // key থাকলে auto-load
    if (adminKey.trim()) fetchSellers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setJoiningDate("");
    setImageDataUrl(undefined);
    setErr("");
  };

  const openModal = () => {
    resetForm();
    setOpen(true);
  };
  const closeModal = () => setOpen(false);

  const handlePickImage = (file?: File | null) => {
    if (!file) return setImageDataUrl(undefined);
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!adminKey.trim()) return "Admin API Key দিন (backend .env এর ADMIN_API_KEY)";
    if (!firstName.trim()) return "First name is required";
    if (!lastName.trim()) return "Last name is required";
    if (!phone.trim()) return "Phone is required";
    if (!email.trim()) return "Email is required (Seller login এর জন্য)";
    if (!joiningDate.trim()) return "Joining date is required";
    return "";
  };

  const createSeller = async () => {
    const e = validate();
    if (e) return setErr(e);

    setErr("");
    setCreating(true);

    const password = genPassword();
    const sellerEmail = email.trim().toLowerCase();

    try {
      const headersBase = buildAdminHeaders();
      if (!headersBase.Authorization && !headersBase["x-admin-key"]) {
        throw new Error("Admin login করুন অথবা Admin API Key দিন");
      }
      const res = await fetch(`${API_BASE}/api/sellers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headersBase,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          joiningDate,
          imageDataUrl,
          email: sellerEmail,
          password,
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        }),
      });

      if (!res.ok) {
        const msg = await safeReadJsonMessage(res);
        throw new Error(msg || `Failed to create seller (${res.status})`);
      }

      closeModal();

      alert(
        `✅ Seller created!\n\nLogin Email: ${sellerEmail}\nPassword: ${password}\n\n(Password আবার দেখাবে না, তাই এখনই কপি করে রাখুন)`
      );

      await fetchSellers();
    } catch (ex: any) {
      setErr(ex?.message || "Failed to create seller");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[#ff2a6d] font-bold text-2xl">{header}</div>
          <div className="text-gray-600 mt-1">(Saved in MongoDB ✅)</div>
        </div>
      </div>

      {/* Admin key (ছোট + ডিজাইন-বান্ধব) */}
      <div className="mt-5 bg-white border border-black/10 rounded-2xl p-4">
        <div className="text-sm font-semibold">Admin API Key (x-admin-key)</div>
        <div className="text-xs text-gray-500 mt-1">
          Backend এর <code>ai-bot/.env</code> ফাইলে যে <code>ADMIN_API_KEY</code>
          আছে—ঠিক সেটা এখানে দিবেন।
        </div>

        <div className="mt-3 flex flex-col md:flex-row gap-3">
          <input
            value={adminKey}
            onChange={(e) => persistAdminKey(e.target.value)}
            placeholder="Paste admin api key"
            className="w-full md:flex-1 border-2 border-black rounded-xl px-4 py-3 outline-none"
          />
          <button
            onClick={fetchSellers}
            disabled={loadingList}
            className="px-6 py-3 border-2 border-black rounded-2xl bg-white font-medium transition hover:bg-black hover:text-white active:scale-[0.98] disabled:opacity-60"
          >
            {loadingList ? "Loading..." : "Load Sellers"}
          </button>
        </div>

        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
      </div>

      <div className="mt-6 bg-white border border-black/10 rounded-2xl p-4 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Total: <span className="font-semibold text-gray-800">{sellers.length}</span>
        </div>

        <button
          onClick={openModal}
          className="px-6 py-3 border-2 border-black rounded-2xl bg-white font-medium transition hover:bg-black hover:text-white active:scale-[0.98]"
        >
          + add new seller
        </button>
      </div>

      <div className="mt-6">
        {sellers.length === 0 ? (
          <div className="bg-white border border-black/10 rounded-2xl p-8 text-gray-600">
            No sellers yet. Click <b>add new seller</b> to create one.
          </div>
        ) : (
          <div className="bg-white border border-black/10 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-3 border-b bg-gray-50 text-xs font-semibold text-gray-600">
              <div className="col-span-5">Seller</div>
              <div className="col-span-4">Login (Email)</div>
              <div className="col-span-2">Created</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            {sellers.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-12 px-4 py-4 border-b last:border-b-0 items-center"
              >
                <div className="col-span-5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border overflow-hidden bg-gray-100 flex items-center justify-center">
                    <span className="text-xs text-gray-400">IMG</span>
                  </div>
                  <div>
                    <div className="font-semibold">{s.name || "Unnamed"}</div>
                    <div className="text-xs text-gray-500">status: {s.isActive ? "active" : "inactive"}</div>
                  </div>
                </div>

                <div className="col-span-4">
                  <div className="font-mono text-sm break-all">{s.email}</div>
                </div>

                <div className="col-span-2 text-sm text-gray-600">
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "-"}
                </div>

                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => deleteSeller(s.id)}
                    className="px-3 py-2 rounded-xl border border-black/20 text-xs hover:bg-black hover:text-white transition"
                    title="Delete/Deactivate"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />

          <div className="relative w-[92vw] max-w-[720px] bg-white rounded-2xl border-2 border-black p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-bold">Create new seller</div>
                <div className="text-sm text-gray-500 mt-1">Fill details & create login.</div>
              </div>
              <button
                onClick={closeModal}
                className="px-3 py-1 rounded-lg border border-black/20 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-gray-600">First name *</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full border-2 border-black rounded-xl px-4 py-3 outline-none"
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-gray-600">Last name *</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full border-2 border-black rounded-xl px-4 py-3 outline-none"
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-gray-600">Phone *</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full border-2 border-black rounded-xl px-4 py-3 outline-none"
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-gray-600">Email *</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full border-2 border-black rounded-xl px-4 py-3 outline-none"
                />
                <div className="text-xs text-gray-500 mt-1">
                  (Seller login এ এই Email ব্যবহার হবে)
                </div>
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-gray-600">Joining date *</label>
                <input
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="mt-1 w-full border-2 border-black rounded-xl px-4 py-3 outline-none"
                />
              </div>

              <div className="col-span-12 md:col-span-6">
                <label className="text-sm text-gray-600">Image</label>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePickImage(e.target.files?.[0] || null)}
                />

                <div className="mt-1 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="px-4 py-3 border-2 border-black rounded-xl hover:bg-black hover:text-white transition"
                  >
                    Upload Image
                  </button>

                  {imageDataUrl ? (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageDataUrl}
                        alt="preview"
                        className="w-12 h-12 rounded-xl border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setImageDataUrl(undefined)}
                        className="text-sm underline text-gray-600"
                      >
                        remove
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">No image selected</div>
                  )}
                </div>
              </div>
            </div>

            {err && <div className="mt-4 text-sm text-red-600">{err}</div>}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-5 py-3 rounded-xl border border-black/20 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                disabled={creating}
                onClick={createSeller}
                className="px-6 py-3 rounded-xl border-2 border-black bg-black text-white hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Seller"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
