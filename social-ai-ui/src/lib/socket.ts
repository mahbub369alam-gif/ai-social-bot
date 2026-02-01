import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    // ✅ attach auth (seller token or admin key) so server can route events safely
    let token = "";
    let adminKey = "";
    try {
      const adminToken = localStorage.getItem("admin_token_v1") || "";
      const sellerToken = localStorage.getItem("seller_token_v1") || "";
      token = adminToken || sellerToken;
      adminKey = localStorage.getItem("social_ai_admin_key_v1") || "";
    } catch {
      // ignore
    }

    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL as string, {
      transports: ["websocket"],
      auth: { token, adminKey },
    });
  }
  return socket;
};
