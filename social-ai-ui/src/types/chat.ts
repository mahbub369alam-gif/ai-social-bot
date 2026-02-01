export type LiveMsg = {
  conversationId: string;
  customerName: string;
  customerProfilePic?: string;
  sender: "customer" | "bot";
  // Optional metadata (backward compatible with older DB rows)
  senderRole?: "customer" | "admin" | "seller" | "ai";
  senderName?: string;
  message: string;
  platform: "facebook" | "instagram";
  pageId: string;
  timestamp: string;
};
