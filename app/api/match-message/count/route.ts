// app/api/match-message/count/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/match-message/count
 * 自分が受信したメッセージのうち、まだマッチしていないものの件数を返す
 * （非表示・期限切れは除外。期限は SentMessage.expiresAt >= now）
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("userId");
  if (!userId) {
    return NextResponse.json({ count: 0 });
  }
  const now = new Date();
  try {
    const unmatchedMessages = await prisma.sentMessage.findMany({
      where: {
        receiverId: userId,
        isHidden: false,
        expiresAt: { gte: now },
      },
      select: {
        id: true,
        senderId: true,
        message: true,
      },
    });

    let unmatchedCount = 0;

    for (const receivedMessage of unmatchedMessages) {
      const matchExists = await prisma.matchPair.findFirst({
        where: {
          message: receivedMessage.message,
          OR: [
            { user1Id: receivedMessage.senderId, user2Id: userId },
            { user1Id: userId, user2Id: receivedMessage.senderId },
          ],
        },
      });

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
