// server.ts

import { Server } from "socket.io";
import { createServer } from "http";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // ✅ CORS 設定（フロントエンドからのアクセスを許可）
  },
});

// ユーザーIDとソケットIDのマッピング
const userSockets = new Map<string, string>();

io.on("connection", (socket) => {
  console.log("⚡️ ユーザーが WebSocket に接続:", socket.id);

  // ユーザーIDを設定してルームに参加
  socket.on("setUserId", (userId: string) => {
    console.log(
      `👤 ユーザー ${userId} (socket: ${socket.id}) がユーザールームに参加`
    );
    userSockets.set(userId, socket.id);
    socket.join(`user-${userId}`);
  });

  // チャットルームに参加
  socket.on("joinChat", (chatId: string) => {
    console.log(`💬 socket ${socket.id} がチャット ${chatId} のルームに参加`);
    socket.join(`chat-${chatId}`);
  });

  // メッセージ送信
  socket.on(
    "sendMessage",
    (data: { chatId: string; toUserId: string; message: any }) => {
      console.log("📩 新しいメッセージ受信:", {
        chatId: data.chatId,
        toUserId: data.toUserId,
        messageId: data.message?.id,
      });

      // メッセージのペイロード（クライアントが期待する形式）
      const payload = {
        chatId: data.chatId,
        message: data.message,
      };

      // 1. チャットルームに送信（そのチャットを開いているすべてのユーザー）
      console.log(`📤 チャットルーム chat-${data.chatId} に送信`);
      io.to(`chat-${data.chatId}`).emit("newMessage", payload);

      // 2. 受信者のユーザールームにも送信（チャットを開いていない場合用）
      console.log(`📤 ユーザールーム user-${data.toUserId} に送信`);
      io.to(`user-${data.toUserId}`).emit("newMessage", payload);
    }
  );

  socket.on("disconnect", () => {
    console.log("❌ ユーザーが切断しました:", socket.id);
    // ユーザーマップから削除
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        console.log(`👋 ユーザー ${userId} が切断`);
        userSockets.delete(userId);
        break;
      }
    }
  });
});

// ✅ WebSocket サーバーを `3001` ポートで起動
httpServer.listen(3001, () => {
  console.log("🚀 WebSocket サーバー起動 (ポート: 3001)");
});
