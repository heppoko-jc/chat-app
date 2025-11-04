// app/api/admin/hide-match-message/route.ts
// 管理者用API - マッチ済みメッセージを非表示にする

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    // 管理者認証
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);
    const expectedApiKey =
      process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123";

    if (apiKey !== expectedApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { matchPairId, message, userIds } = await req.json();

    // matchPairIdまたは(message + userIds)のどちらかが必要
    if (
      !matchPairId &&
      (!message || !userIds || !Array.isArray(userIds) || userIds.length !== 2)
    ) {
      return NextResponse.json(
        {
          error:
            "matchPairId or (message and userIds array with 2 elements) is required",
        },
        { status: 400 }
      );
    }

    // トランザクション内で処理
    const result = await prisma.$transaction(async (tx) => {
      // 1. MatchPairを取得
      let targetMatchPairs: Array<{
        id: string;
        user1Id: string;
        user2Id: string;
        message: string;
      }> = [];

      if (matchPairId) {
        const matchPair = await tx.matchPair.findUnique({
          where: { id: matchPairId },
        });
        if (!matchPair) {
          throw new Error("MatchPair not found");
        }
        targetMatchPairs = [matchPair];
      } else {
        const [user1Id, user2Id] = userIds;
        const matchPairs = await tx.matchPair.findMany({
          where: {
            message,
            OR: [
              { user1Id, user2Id },
              { user1Id: user2Id, user2Id: user1Id },
            ],
          },
        });
        if (matchPairs.length === 0) {
          throw new Error("MatchPair not found");
        }
        targetMatchPairs = matchPairs;
      }

      // 2. 対応するSentMessageを非表示に設定
      const hiddenMessageIds: string[] = [];
      for (const matchPair of targetMatchPairs) {
        // 両方向のSentMessageを非表示にする
        const sentMessage1 = await tx.sentMessage.findFirst({
          where: {
            message: matchPair.message,
            senderId: matchPair.user1Id,
            receiverId: matchPair.user2Id,
          },
          select: { id: true },
        });
        const sentMessage2 = await tx.sentMessage.findFirst({
          where: {
            message: matchPair.message,
            senderId: matchPair.user2Id,
            receiverId: matchPair.user1Id,
          },
          select: { id: true },
        });

        if (sentMessage1) {
          await tx.sentMessage.update({
            where: { id: sentMessage1.id },
            data: { isHidden: true },
          });
          hiddenMessageIds.push(sentMessage1.id);
        }

        if (sentMessage2) {
          await tx.sentMessage.update({
            where: { id: sentMessage2.id },
            data: { isHidden: true },
          });
          hiddenMessageIds.push(sentMessage2.id);
        }
      }

      return {
        hiddenCount: hiddenMessageIds.length,
        matchPairCount: targetMatchPairs.length,
        messageIds: hiddenMessageIds,
      };
    });

    return NextResponse.json({
      success: true,
      hidden: {
        matchPairs: result.matchPairCount,
        sentMessages: result.hiddenCount,
      },
      details: {
        messageIds: result.messageIds,
      },
    });
  } catch (error) {
    console.error("🚨 マッチメッセージ非表示エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to hide match message",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
