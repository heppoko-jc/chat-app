// app/api/auth/reset-password/route.ts

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();

    console.log("🔹 パスワードリセット実行:", {
      token: token.substring(0, 10) + "...",
    });

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "トークンと新しいパスワードが必要です" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "新しいパスワードは6文字以上である必要があります" },
        { status: 400 }
      );
    }

    // トークンでユーザーを検索
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date(), // 有効期限内
        },
      },
    });

    if (!user) {
      console.error("🚨 無効または期限切れのトークン");
      return NextResponse.json(
        { error: "無効または期限切れのトークンです" },
        { status: 400 }
      );
    }

    // 新しいパスワードをハッシュ化
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // パスワードを更新し、トークンをクリア
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    console.log("✅ パスワードが正常にリセットされました:", {
      email: user.email,
    });

    return NextResponse.json({
      message: "パスワードが正常にリセットされました",
    });
  } catch (error) {
    console.error("🚨 パスワードリセットエラー:", error);
    return NextResponse.json(
      { error: "パスワードのリセットに失敗しました" },
      { status: 500 }
    );
  }
}
