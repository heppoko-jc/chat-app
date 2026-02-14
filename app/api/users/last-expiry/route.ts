// app/api/users/last-expiry/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidExpiryDays } from "@/lib/match-utils";

/**
 * GET /api/users/last-expiry
 * ヘッダー userId を元に、最後に送信で使ったマッチ有効期間（日数）を返す
 * 返却: { lastMatchExpiryDays: number }（1 | 7 | 14）
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("userId");
  if (!userId) {
    return NextResponse.json({ lastMatchExpiryDays: 1 }, { status: 200 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastMatchExpiryDays: true },
    });

    const days = user?.lastMatchExpiryDays ?? 1;
    const safe = isValidExpiryDays(days) ? days : 1;

    return NextResponse.json({ lastMatchExpiryDays: safe });
  } catch (error) {
    console.error("GET /api/users/last-expiry error:", error);
    return NextResponse.json({ lastMatchExpiryDays: 1 }, { status: 200 });
  }
}
