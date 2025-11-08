// app/api/users/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/users
 * 登録ユーザー一覧を返却
 */
export async function GET() {
  try {
    // 非表示にするユーザーIDを取得
    const hiddenUserIds =
      process.env.HIDDEN_USER_IDS?.split(",").filter(Boolean) || [];

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            id: {
              notIn: hiddenUserIds, // 非表示ユーザーを除外
            },
          },
          {
            email: {
              notIn: ["yoko.kiyama@icloud.com", "miharu.kiyama@icloud.com"], // メールアドレスでも除外
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        nameEn: true,
        nameJa: true,
        nameOther: true,
        bio: true,
        createdAt: true,
      },
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
