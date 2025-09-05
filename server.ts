// server.ts

import { Server } from "socket.io";
import { createServer } from "http";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // ✅ CORS 設定（フロントエンドからのアクセスを許可）
  },
});

io.on("connection", (socket) => {
  console.log("⚡️ ユーザーが WebSocket に接続");

  socket.on("sendMessage", (message) => {
    console.log("📩 新しいメッセージ:", message);
    io.emit("newMessage", message); // ✅ すべてのクライアントに送信
  });

  socket.on("disconnect", () => {
    console.log("❌ ユーザーが切断しました");
  });
});

// ✅ WebSocket サーバーを `3001` ポートで起動
httpServer.listen(3001, () => {
  console.log("🚀 WebSocket サーバー起動 (ポート: 3001)");
});
