"use client";

import { useMemo, useState } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const Sidebar = useMemo(
    () => (
      <div className="h-full bg-white border-r border-black/10">
        <div className="p-5 border-b border-black/10">
          <div className="text-xl font-bold">Admin Dashboard</div>
          <div className="text-xs text-gray-500 mt-1">Social AI Bot</div>
        </div>

        <nav className="p-3 space-y-2">
          <a
            href="/admin/inbox"
            className="block px-4 py-3 rounded-lg border border-black/10 hover:bg-black hover:text-white transition"
          >
            📥 Inbox
          </a>
          <a
            href="/admin/sellers"
            className="block px-4 py-3 rounded-lg border border-black/10 hover:bg-black hover:text-white transition"
          >
            👥 Sellers
          </a>
          <a
            href="/admin/seller"
            className="block px-4 py-3 rounded-lg border border-black/10 hover:bg-black hover:text-white transition"
          >
            🧑‍💼 Create Seller
          </a>
          <a
            href="/admin/api"
            className="block px-4 py-3 rounded-lg border border-black/10 hover:bg-black hover:text-white transition"
          >
            🔌 API Integration
          </a>
          <a
            href="/admin/logout"
            className="block px-4 py-3 rounded-lg border border-black/10 hover:bg-black hover:text-white transition"
          >
            🚪 Logout
          </a>
        </nav>
      </div>
    ),
    []
  );

  return (
    <div className="min-h-screen bg-[#f6f6f6]">
      {/* Mobile topbar */}
      <div className="md:hidden sticky top-0 z-40 border-b border-black/10 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2 text-sm hover:bg-black hover:text-white transition"
            aria-label="Open menu"
          >
            ☰ Menu
          </button>
          <div className="text-sm font-semibold">Admin</div>
          <div className="w-[64px]" />
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-[340px] shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white">
              <div className="text-sm font-semibold">Menu</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-black/10 px-4 py-2 text-sm hover:bg-black hover:text-white transition"
              >
                ✕
              </button>
            </div>
            <div className="h-[calc(100%-52px)] overflow-y-auto">{Sidebar}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12">
        {/* Desktop sidebar */}
        <aside className="hidden md:block md:col-span-3 lg:col-span-2">{Sidebar}</aside>

        {/* Content */}
        <main className="col-span-12 md:col-span-9 lg:col-span-10">
          {children}
        </main>
      </div>
    </div>
  );
}
