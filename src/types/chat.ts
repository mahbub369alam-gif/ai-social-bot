export type LiveMsg = {
  conversationId: string;
  customerName: string;
  sender: "customer" | "bot";
  message: string;
  platform: "facebook" | "instagram";
  pageId: string;
  timestamp: string;
};
