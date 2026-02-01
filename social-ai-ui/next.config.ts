import type { NextConfig } from "next";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const nextConfig: NextConfig = {
  // Proxy uploads through the Next.js server so the panel can render media even when
  // the backend is not directly reachable from the browser (common during ngrok/local dev).
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${API}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
