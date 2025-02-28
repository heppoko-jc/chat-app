import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    // ✅ 自分が送信したマッチメッセージ履歴
    const sentMessages = await prisma.sentMessage.findMany({
      where: { senderId: userId },
      include: {
        receiver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // ✅ 自分のマッチング履歴
    const matchedPairs = await prisma.matchPair.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
      },
      orderBy: { matchedAt: "desc" },
    });

    // ✅ 送信済みメッセージとマッチ済みメッセージの照合
    const updatedSentMessages = sentMessages.map((msg) => ({
      ...msg,
      isMatched: matchedPairs.some(
        (match) =>
          match.message === msg.message &&
          (match.user1.id === msg.receiver.id || match.user2.id === msg.receiver.id)
      ),
    }));

    return NextResponse.json({ sentMessages: updatedSentMessages, matchedPairs });
  } catch (error) {
    console.error("🚨 通知データ取得エラー:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
