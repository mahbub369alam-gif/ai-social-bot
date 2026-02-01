//Seller Panel section

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // Session hydration
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<{ sellerId: string; name?: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // ✅ Mobile drawer state MUST be declared with other hooks (before any early return)
  const [open, setOpen] = useState(false);

  const sellerName = useMemo(() => session?.name || session?.sellerId || "Seller", [session]);

  // Read localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem("seller_session_v1");
      setSession(raw ? JSON.parse(raw) : null);
      setToken(localStorage.getItem("seller_token_v1"));
    } catch {
      setSession(null);
      setToken(null);
    } finally {
      setHydrated(true);
    }
  }, []);

  // Guard: ONLY after hydrated
  useEffect(() => {
    if (!hydrated) return;

    // login page allowed
    if (pathname === "/seller/login") return;

    // other seller pages require session + token
    if (!session || !token) router.replace("/seller/login");
  }, [hydrated, session, token, pathname, router]);

  // Close drawer on route change (mobile nicety)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const logout = () => {
    localStorage.removeItem("seller_session_v1");
    localStorage.removeItem("seller_token_v1");
    // clear cookies as well (used by middleware)
    document.cookie = "seller_token_v1=; Max-Age=0; path=/";
    document.cookie = "seller_session_v1=; Max-Age=0; path=/";
    router.replace("/seller/login");
  };

  // Wait until hydrated (avoid redirect loop)
  if (!hydrated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Login page: no sidebar
  if (pathname === "/seller/login") return <>{children}</>;

  const Sidebar = (
    <div className="h-full bg-white border-r border-black/10">

      <p className="text-[#adadad]">ui/app/seller/layout.tsx</p>
      <div className="p-2 border-b border-black/10">
        <div className="text-lg font-bold">Seller Panel</div>
        <div className="text-xs text-gray-500 mt-1">{sellerName}</div>
      </div>

      <nav className="p-3 space-y-2">
        <a
          href="/seller/inbox"
          className="block px-4 py-3 rounded hover:bg-black hover:text-white transition"
        >
          📥 Inbox
        </a>
      </nav>

      <div className="p-3">
        <button
          onClick={logout}
          className="w-full px-4 py-3 rounded border border-black/20 hover:bg-black hover:text-white transition"
        >
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile Topbar */}
      <div className="md:hidden sticky top-0 z-40 border-b bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black hover:text-white transition"
            aria-label="Open menu"
          >
            ☰ Menu
          </button>

          <div className="text-sm font-semibold">Seller Panel</div>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black hover:text-white transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-[340px] bg-white shadow-xl border-r border-black/10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
              <div className="text-sm font-semibold">Menu</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black hover:text-white transition"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="h-[calc(100%-52px)] overflow-y-auto">{Sidebar}</div>
          </div>
        </div>
      )}

      {/* Desktop layout */}
      <div className="grid grid-cols-12">
        <aside className="hidden md:block md:col-span-3 lg:col-span-2 bg-white border-r border-black/10 min-h-screen sticky top-0">
          <div className="h-screen overflow-y-auto">{Sidebar}</div>
        </aside>

        <main className="col-span-12 md:col-span-9 lg:col-span-10">{children}</main>
      </div>
    </div>
  );
}
