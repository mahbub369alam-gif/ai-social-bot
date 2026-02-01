import { NextRequest, NextResponse } from "next/server";

/**
 * ✅ Route guard at the edge (prevents direct URL paste into /seller/* without auth).
 * We store the seller token in BOTH localStorage (for client fetch) and a cookie
 * (so middleware can block unauth access before page loads).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page
  if (pathname === "/seller/login") return NextResponse.next();

  // Allow admin login page
  if (pathname === "/admin/login") return NextResponse.next();

  // Protect all seller routes
  if (pathname.startsWith("/seller")) {
    const token = req.cookies.get("seller_token_v1")?.value || "";
    const session = req.cookies.get("seller_session_v1")?.value || "";

    if (!token || !session) {
      const url = req.nextUrl.clone();
      url.pathname = "/seller/login";
      return NextResponse.redirect(url);
    }
  }

  // Protect all admin routes
  if (pathname.startsWith("/admin")) {
    const token = req.cookies.get("admin_token_v1")?.value || "";
    const session = req.cookies.get("admin_session_v1")?.value || "";
    if (!token || !session) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/seller/:path*", "/admin/:path*"],
};
