// app/api/admin/hide-unmatched-message/route.ts
// 管理者用API - 未マッチメッセージを非表示にする

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

    const { messageId, messageIds } = await req.json();
    const ids = messageIds || (messageId ? [messageId] : []);

    if (!ids.length) {
      return NextResponse.json(
        { error: "messageId or messageIds is required" },
        { status: 400 }
      );
    }

    // トランザクション内で処理
    const result = await prisma.$transaction(async (tx) => {
      // 1. 対象メッセージが未マッチであることを確認
      const messages = await tx.sentMessage.findMany({
        where: { id: { in: ids } },
      });

      if (messages.length === 0) {
        throw new Error("Messages not found");
      }

      // 2. マッチペアを確認
      const allMatches = await tx.matchPair.findMany({
        select: {
          user1Id: true,
          user2Id: true,
          message: true,
        },
      });

      const matchedSet = new Set<string>();
      allMatches.forEach((match) => {
        matchedSet.add(`${match.message}-${match.user1Id}-${match.user2Id}`);
        matchedSet.add(`${match.message}-${match.user2Id}-${match.user1Id}`);
      });

      const unmatchedMessages = messages.filter((msg) => {
        const key = `${msg.message}-${msg.senderId}-${msg.receiverId}`;
        return !matchedSet.has(key);
      });

      if (unmatchedMessages.length === 0) {
        throw new Error(
          "All specified messages are already matched. Use delete-match-message API instead."
        );
      }

      // 3. 非表示に設定
      const updateResult = await tx.sentMessage.updateMany({
        where: {
          id: { in: unmatchedMessages.map((m) => m.id) },
        },
        data: {
          isHidden: true,
        },
      });

      return {
        hiddenCount: updateResult.count,
        messageIds: unmatchedMessages.map((m) => m.id),
      };
    });

    return NextResponse.json({
      success: true,
      hidden: {
        count: result.hiddenCount,
      },
      details: {
        messageIds: result.messageIds,
      },
    });
  } catch (error) {
    console.error("🚨 未マッチメッセージ非表示エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to hide unmatched message",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
