// app/api/admin/reset-user-password/route.ts
// 開発環境向け: メール送信なしでユーザーのパスワードを直接リセットする機能

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { identifier, newPassword } = await req.json();

    // 開発環境チェック（本番環境では無効化推奨）
    const isDevelopment = process.env.NODE_ENV === "development";
    if (!isDevelopment) {
      console.warn("⚠️ このAPIは開発環境でのみ使用してください");
      // 本番環境でも動作させる場合は、管理者認証を追加してください
    }

    if (!identifier || !newPassword) {
      return NextResponse.json(
        {
          error:
            "識別子（メールアドレスまたはユーザー名）と新しいパスワードが必要です",
        },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "パスワードは6文字以上である必要があります" },
        { status: 400 }
      );
    }

    // ユーザーを検索（メールアドレスまたはユーザー名）
    const identifierStr = String(identifier).trim();
    const user = await prisma.user.findFirst({
      where: identifierStr.includes("@")
        ? { email: identifierStr }
        : { OR: [{ email: identifierStr }, { name: identifierStr }] },
    });

    if (!user) {
      return NextResponse.json(
        { error: `ユーザー "${identifier}" が見つかりません` },
        { status: 404 }
      );
    }

    // パスワードをハッシュ化
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // パスワードを更新
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    console.log("✅ パスワードが正常にリセットされました:", {
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    return NextResponse.json({
      message: "パスワードが正常にリセットされました",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("🚨 パスワードリセットエラー:", error);
    return NextResponse.json(
      { error: "パスワードのリセットに失敗しました" },
      { status: 500 }
    );
  }
}
