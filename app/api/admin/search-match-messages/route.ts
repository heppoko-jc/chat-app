// app/api/admin/search-match-messages/route.ts
// 管理者用API - マッチメッセージを検索

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

    let matchPairs;

    if (message && userId) {
      // メッセージ内容とユーザーIDで検索
      matchPairs = await prisma.matchPair.findMany({
        where: {
          message: { contains: message },
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        include: {
          user1: { select: { id: true, name: true, email: true } },
          user2: { select: { id: true, name: true, email: true } },
        },
        orderBy: { matchedAt: "desc" },
        take: limit,
      });
    } else if (message) {
      // メッセージ内容のみで検索
      matchPairs = await prisma.matchPair.findMany({
        where: {
          message: { contains: message },
        },
        include: {
          user1: { select: { id: true, name: true, email: true } },
          user2: { select: { id: true, name: true, email: true } },
        },
        orderBy: { matchedAt: "desc" },
        take: limit,
      });
    } else if (userId) {
      // ユーザーIDのみで検索
      matchPairs = await prisma.matchPair.findMany({
        where: {
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        include: {
          user1: { select: { id: true, name: true, email: true } },
          user2: { select: { id: true, name: true, email: true } },
        },
        orderBy: { matchedAt: "desc" },
        take: limit,
      });
    } else {
      // 全て取得（最新順）
      matchPairs = await prisma.matchPair.findMany({
        include: {
          user1: { select: { id: true, name: true, email: true } },
          user2: { select: { id: true, name: true, email: true } },
        },
        orderBy: { matchedAt: "desc" },
        take: limit,
      });
    }

    return NextResponse.json({
      count: matchPairs.length,
      matchPairs: matchPairs.map((mp) => ({
        id: mp.id,
        message: mp.message,
        matchedAt: mp.matchedAt.toISOString(),
        user1: mp.user1,
        user2: mp.user2,
      })),
    });
  } catch (error) {
    console.error("🚨 マッチメッセージ検索エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to search match messages",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
