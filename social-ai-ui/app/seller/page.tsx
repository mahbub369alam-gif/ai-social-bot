"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function SellerWelcomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<{ sellerId: string; name?: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("seller_session_v1");
      setSession(raw ? JSON.parse(raw) : null);
    } catch {
      setSession(null);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace("/seller/login");
  }, [hydrated, session, router]);

  const sellerName = useMemo(() => session?.name || session?.sellerId || "Seller", [session]);

  if (!hydrated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-[calc(100vh-0px)] flex items-center justify-center p-6">
      <div className="w-full max-w-[680px] bg-white border border-black/10 rounded-3xl p-10">
        <div className="text-3xl font-extrabold text-[#ff2a6d]">
          Welcome, {sellerName} 👋
        </div>

        <div className="mt-4 text-gray-600 leading-relaxed">
          আপনি সফলভাবে লগইন করেছেন। Inbox এ গিয়ে কাস্টমার মেসেজগুলো দেখুন।
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            onClick={() => router.push("/seller/inbox")}
            className="px-7 py-3 rounded-2xl border-2 border-black bg-black text-white font-semibold hover:opacity-90 active:scale-[0.98] transition"
          >
            Go to Inbox →
          </button>

          <button
            onClick={() => {
              localStorage.removeItem("seller_session_v1");
              router.replace("/seller/login");
            }}
            className="px-7 py-3 rounded-2xl border-2 border-black bg-white font-semibold hover:bg-black hover:text-white active:scale-[0.98] transition"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
