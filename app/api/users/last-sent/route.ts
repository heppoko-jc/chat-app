// app/api/users/last-sent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/users/last-sent
 * ヘッダー userId を元に、そのユーザーが各相手に最後に送った時刻を返す
 * 返却形式: { userId: string; lastSentAt: string | null }[]
 */
export async function GET(req: NextRequest) {
  const currentUserId = req.headers.get("userId");
  if (!currentUserId) return NextResponse.json([], { status: 200 });

  try {
    // 自分以外の全ユーザーを取得
    const users = await prisma.user.findMany({
      where: { id: { not: currentUserId } },
      select: { id: true },
    });

    if (users.length === 0) return NextResponse.json([]);

    // 相手ごとの最後に送ったメッセージ時刻
    const lastSents = await prisma.sentMessage.groupBy({
      by: ["receiverId"],
      where: { senderId: currentUserId },
      _max: { createdAt: true },
    });

    const map = new Map<string, string | null>();
    lastSents.forEach((row) => {
      map.set(
        row.receiverId,
        row._max.createdAt ? row._max.createdAt.toISOString() : null
      );
    });

    const result = users.map((u) => ({
      userId: u.id,
      lastSentAt: map.get(u.id) ?? null,
    }));

    return NextResponse.json(result);
  } catch (e) {
    console.log("Error fetching last sent:", e);
    return NextResponse.json([], { status: 500 });
  }
}
