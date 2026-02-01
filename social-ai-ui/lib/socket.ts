import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    const getAuth = () => {
  if (typeof window === "undefined") return {};
  const path = window.location.pathname || "";
  const isAdmin = path.startsWith("/admin");
  if (isAdmin) {
    const adminToken = window.localStorage.getItem("admin_token_v1") || "";
    if (adminToken) return { token: adminToken, role: "admin" };
    const adminKey = window.localStorage.getItem("social_ai_admin_key_v1") || "";
    return adminKey ? { adminKey } : {};
  }
  const token = window.localStorage.getItem("seller_token_v1") || "";
  return token ? { token } : {};
};

socket = io(process.env.NEXT_PUBLIC_SOCKET_URL as string, {
      transports: ["websocket"],
      auth: getAuth(),
    });
  }
  return socket;
};
