// app/api/match-message/count/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/match-message/count
 * ヘッダー userId をもとに、
 * 自分が受信したメッセージのうち、まだマッチしていないものの件数を返す
 * （取り消されたメッセージは自動的に除外される）
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("userId");
  if (!userId) {
    return NextResponse.json({ count: 0 });
  }
  try {
    // 自分が受信したメッセージのうち、マッチしていないものをカウント
    // 取り消されたメッセージは既にDBから削除されているため、自動的に除外される
    const unmatchedMessages = await prisma.sentMessage.findMany({
      where: {
        receiverId: userId,
      },
      select: {
        id: true,
        senderId: true,
        message: true,
        createdAt: true,
      },
    });

    let unmatchedCount = 0;

    for (const receivedMessage of unmatchedMessages) {
      // このメッセージについて、マッチが成立しているかチェック
      const matchExists = await prisma.matchPair.findFirst({
        where: {
          message: receivedMessage.message,
          OR: [
            { user1Id: receivedMessage.senderId, user2Id: userId },
            { user1Id: userId, user2Id: receivedMessage.senderId },
          ],
        },
      });

      // マッチが存在しない場合のみカウント
      if (!matchExists) {
        unmatchedCount++;
      }
    }

    return NextResponse.json({ count: unmatchedCount });
  } catch (error) {
    console.error("Error counting unmatched messages:", error);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}
