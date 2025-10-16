// app/api/check-match/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { io as ioClient } from "socket.io-client";

const prisma = new PrismaClient();
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

    // 自分が receiver になっているメッセージを取得
    const matches = await prisma.sentMessage.findMany({
      where: { receiverId: senderId, message },
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

      // WebSocket サーバーにマッチ成立を通知 → socket-server はそれを受けて newMatch を broadcast
      const socket = ioClient(SOCKET_URL, { transports: ["websocket"] });

      // 送信者への通知
      socket.emit("matchEstablished", {
        matchId: newPair.id,
        message: newPair.message,
        matchedAt: newPair.matchedAt.toISOString(),
        matchedUserId: match.senderId,
        matchedUserName: "マッチしたユーザー", // 必要に応じてユーザー情報を取得
        chatId: chatId, // チャットIDを追加
        targetUserId: senderId, // 送信先を指定
      });

      // 受信者への通知
      socket.emit("matchEstablished", {
        matchId: newPair.id,
        message: newPair.message,
        matchedAt: newPair.matchedAt.toISOString(),
        matchedUserId: senderId,
        matchedUserName: "マッチしたユーザー", // 必要に応じてユーザー情報を取得
        chatId: chatId, // チャットIDを追加
        targetUserId: match.senderId, // 送信先を指定
      });

      socket.disconnect();
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
