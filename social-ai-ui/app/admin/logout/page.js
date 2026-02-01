
// Admin logout page
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogoutPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      localStorage.removeItem("admin_token_v1");
      localStorage.removeItem("admin_session_v1");
      // legacy key (if user stored it manually)
      // we do NOT force delete it, but removing is safer for shared machines
      // localStorage.removeItem("social_ai_admin_key_v1");
    } catch {}

    // clear cookies used by middleware
    document.cookie = "admin_token_v1=; Max-Age=0; path=/";
    document.cookie = "admin_session_v1=; Max-Age=0; path=/";

    router.replace("/admin/login");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f6f6]">
      <div className="text-sm text-gray-600">Logging out...</div>
    </div>
  );
}
