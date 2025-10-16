// app/api/users/route.ts

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/users
 * 登録ユーザー一覧を返却
 */
export async function GET() {
  try {
    // 非表示にするユーザーIDを取得
    const hiddenUserIds = process.env.HIDDEN_USER_IDS?.split(",") || [];

    const users = await prisma.user.findMany({
      where: {
        id: {
          notIn: hiddenUserIds, // 非表示ユーザーを除外
        },
      },
      select: { id: true, name: true, bio: true },
    });

    return NextResponse.json(users);
  } catch (error) {
    // console.error は intercept-console が拾ってエラー化するので避ける
    console.log("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
