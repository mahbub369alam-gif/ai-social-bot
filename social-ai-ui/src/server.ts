
import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app/app";

import http from "http";
import { Server as SocketIOServer } from "socket.io";

dotenv.config();

const PORT = process.env.PORT || 5000;

// ✅ Create HTTP server
const httpServer = http.createServer(app);

// ✅ Attach Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // পরে production এ তোমার UI domain দিয়ে lock করবে
    methods: ["GET", "POST"],
  },
});

// ✅ Make io accessible in controllers via req.app.get("io")
app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 UI connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 UI disconnected:", socket.id);
  });
});

mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => {
    console.log("MongoDB connected");
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
  });
