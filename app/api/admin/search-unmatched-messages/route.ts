// app/api/admin/search-unmatched-messages/route.ts
// 管理者用API - 未マッチメッセージを検索

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const message = searchParams.get("message");
    const userId = searchParams.get("userId");
    const limit = parseInt(searchParams.get("limit") || "50");

    // 全てのマッチペアを取得して、未マッチメッセージを判定
    const allMatches = await prisma.matchPair.findMany({
      select: {
        user1Id: true,
        user2Id: true,
        message: true,
      },
    });

    // マッチ済みメッセージのセットを作成
    const matchedSet = new Set<string>();
    allMatches.forEach((match) => {
      matchedSet.add(`${match.message}-${match.user1Id}-${match.user2Id}`);
      matchedSet.add(`${match.message}-${match.user2Id}-${match.user1Id}`);
    });

    // SentMessageを検索
    const includeHidden = searchParams.get("includeHidden") === "true";
    let whereClause: any = {};
    if (message) {
      whereClause.message = { contains: message };
    }
    if (userId) {
      whereClause.OR = [{ senderId: userId }, { receiverId: userId }];
    }
    // 非表示を含めるかどうか
    if (!includeHidden) {
      whereClause.isHidden = false; // 非表示以外のみ
    }

    const sentMessages = await prisma.sentMessage.findMany({
      where: whereClause,
      include: {
        sender: { select: { id: true, name: true, email: true } },
        receiver: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit * 2, // 未マッチのみをフィルタするため多めに取得
    });

    // 未マッチメッセージをフィルタリング
    const unmatchedMessages = sentMessages
      .filter((msg) => {
        const key = `${msg.message}-${msg.senderId}-${msg.receiverId}`;
        return !matchedSet.has(key);
      })
      .slice(0, limit); // 必要な数だけ取得

    return NextResponse.json({
      count: unmatchedMessages.length,
      unmatchedMessages: unmatchedMessages.map((msg) => ({
        id: msg.id,
        message: msg.message,
        createdAt: msg.createdAt.toISOString(),
        sender: msg.sender,
        receiver: msg.receiver,
        linkTitle: msg.linkTitle,
        linkImage: msg.linkImage,
      })),
    });
  } catch (error) {
    console.error("🚨 未マッチメッセージ検索エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to search unmatched messages",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
