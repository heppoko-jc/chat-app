import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/friends/restriction
 * ユーザーの制限状態をチェック
 * 返却形式: { canChange: boolean, remainingTime: string | null }
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // データベースから制限状態を取得
    const restriction = await prisma.friendRestriction.findUnique({
      where: { userId },
    });

    if (!restriction) {
      return NextResponse.json({ canChange: true, remainingTime: null });
    }

    const now = new Date();
    const timeDiff = now.getTime() - restriction.lastChange.getTime();
    const minutesDiff = timeDiff / (1000 * 60);

    if (minutesDiff >= 60) {
      return NextResponse.json({ canChange: true, remainingTime: null });
    }

    const remainingMinutes = Math.ceil(60 - minutesDiff);
    return NextResponse.json({
      canChange: false,
      remainingTime: `${remainingMinutes}分`,
    });
  } catch (error) {
    console.error("制限状態チェックエラー:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/friends/restriction
 * ユーザーの制限状態を更新（変更時刻を記録）
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // 制限状態をデータベースに記録
    await prisma.friendRestriction.upsert({
      where: { userId },
      update: { lastChange: new Date() },
      create: { userId, lastChange: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("制限状態更新エラー:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
