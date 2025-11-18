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

  // マッチ成立通知（APIから送信されるイベントを受信してブロードキャスト）
  socket.on(
    "matchEstablished",
    (data: {
      matchId: string;
      chatId?: string;
      message: string;
      matchedAt: string;
      matchedUserId?: string;
      matchedUserName?: string;
      targetUserId?: string;
    }) => {
      console.log("🎯 マッチ成立通知受信:", {
        matchId: data.matchId,
        chatId: data.chatId,
        targetUserId: data.targetUserId,
        matchedUserId: data.matchedUserId,
      });

      // targetUserIdが指定されている場合は、そのユーザーにのみ送信
      if (data.targetUserId) {
        console.log(`📤 ユーザールーム user-${data.targetUserId} に送信`);
        io.to(`user-${data.targetUserId}`).emit("matchEstablished", data);

        // そのチャットを開いているユーザーにも送信（リアルタイム反映のため）
        if (data.chatId) {
          console.log(`📤 チャットルーム chat-${data.chatId} に送信`);
          io.to(`chat-${data.chatId}`).emit("matchEstablished", data);
        }
      } else {
        // targetUserIdが指定されていない場合は、matchedUserIdとsenderIdの両方に送信
        // これは後方互換性のためのフォールバック
        console.log(`📤 ブロードキャスト送信（targetUserId未指定）`);
        io.emit("matchEstablished", data);
      }
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

// ✅ WebSocket サーバーを `3001` ポートで起動（すべてのインターフェースでリッスン）
httpServer.listen(3001, "0.0.0.0", () => {
  console.log("🚀 WebSocket サーバー起動 (ポート: 3001, ホスト: 0.0.0.0)");
});
