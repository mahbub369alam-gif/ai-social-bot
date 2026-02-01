// Customers list (ConversationList)
"use client";

import { useMemo, useState } from "react";

type Item = {
  conversationId: string;
  customerName: string;
  customerProfilePic?: string;
  platform: string;
  lastMessage: string;
  lastTime: string;
  assignedSellerId?: string | null;
  deliveryStatus?: string | null;
};

export default function ConversationList({
  items,
  activeId,
  onSelect,
  isAdmin,
  sellers,
  onUpdateMeta,
}: {
  items: Item[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isAdmin?: boolean;
  sellers?: Array<{ _id?: string; id?: string; name?: string; firstName?: string; lastName?: string; email?: string }>;
  onUpdateMeta?: (conversationId: string, patch: { sellerId?: string | null; deliveryStatus?: string }) => void;
}) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return (items || []).filter((c) => {
      const name = String(c.customerName || "").toLowerCase();
      return name.includes(q);
    });
  }, [items, query]);

  const sellerLabel = (s: any) => {
    const full = [s?.firstName, s?.lastName].filter(Boolean).join(" ").trim();
    return full || s?.name || s?.email || "Seller";
  };

  const assignedSellerName = (sellerId?: string | null) => {
    if (!sellerId) return "Unassign";
    const s = (sellers || []).find((x) => String(x._id || x.id) === String(sellerId));
    return s ? sellerLabel(s) : "Seller";
  };

  const statusLabel = (v?: string | null) => {
    const x = String(v || "confirmed");
    if (x === "delivered") return "delevered";
    if (x === "cancel") return "cancle";
    return x;
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-gray-900 font-semibold text-base">Customers</h2>

        {/* Search */}
        <div className="mt-3">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by customer name…"
              className={[
                "w-full h-10 rounded-md bg-white pl-3 pr-9 text-sm",
                "border border-gray-300 shadow-sm",
                "placeholder:text-gray-400",
                "focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400",
              ].join(" ")}
            />

            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            ) : null}
          </div>

          {/* Result count (only show while filtering) */}
          {query.trim() ? (
            <div className="mt-2 text-[11px] text-gray-500">
              Showing {filteredItems.length} of {items.length}
            </div>
          ) : null}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {filteredItems.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-500">No customers found.</div>
        ) : null}

        {filteredItems.map((c) => {
          const isActive = c.conversationId === activeId;

          return (
            <button
              key={c.conversationId}
              onClick={() => onSelect(c.conversationId)}
              className={[
                "group w-full text-left px-4 py-3 border-b border-gray-100 transition",
                "hover:bg-gray-50",
                isActive ? "bg-gray-50 border-l-2 border-l-gray-900" : "bg-white border-l-2 border-l-transparent",
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div
                  className={[
                    "w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden",
                    isActive ? "ring-2 ring-gray-900/10" : "ring-1 ring-gray-900/5",
                  ].join(" ")}
                >
                  {c.customerProfilePic ? (
                    <img
                      src={c.customerProfilePic}
                      alt={c.customerName || "Customer"}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Row 1: Name / (Seller: Status update) */}
                  <div className="flex items-center justify-between gap-3">
                    <div
                      className="min-w-0 truncate text-sm font-semibold leading-5 text-gray-900"
                      title={c.customerName || c.conversationId}
                    >
                      {c.customerName || c.conversationId}
                    </div>

                    {/* Seller status menu moved to inbox header (ChatWindow) */}
                    {null}
                  </div>

                  {/* Row 2: Message + Time (both) */}
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="min-w-0 truncate text-xs text-gray-600" title={c.lastMessage}>
                      {c.lastMessage}
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-[11px] text-gray-400">
                      {new Date(c.lastTime).toLocaleString()}
                    </div>
                  </div>

                  {/* Row 3: Meta chips */}
                  {isAdmin ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                        <span className="text-gray-500">Seller:</span>
                        <span className="truncate max-w-[160px]" title={assignedSellerName(c.assignedSellerId)}>
                          {assignedSellerName(c.assignedSellerId)}
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                        <span className="text-gray-500">Status:</span>
                        <span>{statusLabel(c.deliveryStatus)}</span>
                      </span>

                      <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                        {String(c.platform || "").toLowerCase()}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-inset ring-gray-200">
                        <span className="text-gray-500">Status:</span>
                        <span>{statusLabel(c.deliveryStatus)}</span>
                      </span>

                      <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                        {String(c.platform || "").toLowerCase()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
