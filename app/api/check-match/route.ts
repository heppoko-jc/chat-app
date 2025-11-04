// app/api/check-match/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { io as ioClient } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

// 2人間のチャットIDを必ず返す（なければ作る）
async function ensureChatBetween(a: string, b: string): Promise<string> {
  const found = await prisma.chat.findFirst({
    where: {
      OR: [
        { user1Id: a, user2Id: b },
        { user1Id: b, user2Id: a },
      ],
    },
    select: { id: true },
  });
  if (found) return found.id;

  // 正順で作成（重複防止）
  const [u1, u2] = a < b ? [a, b] : [b, a];
  const created = await prisma.chat.create({
    data: { user1Id: u1, user2Id: u2 },
    select: { id: true },
  });
  return created.id;
}

/**
 * POST /api/check-match
 * ────────────────────
 * 自分が receiver になった sentMessage をチェックし、
 * マッチがなければ作成 → WebSocket で matchEstablished を emit
 */
export async function POST(req: NextRequest) {
  try {
    const { senderId, message } = await req.json();
    if (!senderId || !message) {
      return NextResponse.json(
        { error: "senderId と message は必須です" },
        { status: 400 }
      );
    }

    // 自分が receiver になっているメッセージを取得（非表示を除外）
    const matches = await prisma.sentMessage.findMany({
      where: {
        receiverId: senderId,
        message,
        isHidden: false, // ← 追加
      },
    });

    for (const match of matches) {
      // 新規 MatchPair 作成（毎回記録）
      const newPair = await prisma.matchPair.create({
        data: {
          user1Id: senderId,
          user2Id: match.senderId,
          message,
        },
      });

      // チャットIDを確保
      const chatId = await ensureChatBetween(senderId, match.senderId);

      // ユーザー情報を取得
      const [senderUser, matchedUser] = await Promise.all([
        prisma.user.findUnique({
          where: { id: senderId },
          select: { id: true, name: true },
        }),
        prisma.user.findUnique({
          where: { id: match.senderId },
          select: { id: true, name: true },
        }),
      ]);

      if (!senderUser || !matchedUser) {
        console.error("🚨 ユーザー情報の取得に失敗");
        continue;
      }

      // WebSocket サーバーにマッチ成立を通知
      const socket = ioClient(SOCKET_URL, { transports: ["websocket"] });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Socket.IO接続タイムアウト"));
          }, 5000);

          socket.on("connect", () => {
            clearTimeout(timeout);
            console.log(`✅ Socket.IOサーバーに接続成功: ${socket.id}`);
            resolve();
          });

          socket.on("connect_error", (error) => {
            clearTimeout(timeout);
            console.error(`❌ Socket.IO接続エラー:`, error);
            reject(error);
          });
        });

        const payload = {
          matchId: newPair.id,
          message: newPair.message,
          matchedAt: newPair.matchedAt.toISOString(),
          chatId,
        };

        // 送信者への通知
        socket.emit("matchEstablished", {
          ...payload,
          matchedUserId: matchedUser.id,
          matchedUserName: matchedUser.name,
          targetUserId: senderId,
        });

        // 受信者への通知
        socket.emit("matchEstablished", {
          ...payload,
          matchedUserId: senderUser.id,
          matchedUserName: senderUser.name,
          targetUserId: match.senderId,
        });

        console.log(`✅ マッチ通知送信完了: ${senderId} と ${match.senderId}`);
      } catch (e) {
        console.error("⚠️ WebSocket通知送信失敗（継続）:", e);
        // 通知はベストエフォートなので続行
      } finally {
        setTimeout(() => socket.disconnect(), 50);
      }
    }

    return NextResponse.json({ message: "Match check complete." });
  } catch (error) {
    console.error("🚨 Match チェックエラー:", error);
    return NextResponse.json(
      { error: "Match チェック中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
