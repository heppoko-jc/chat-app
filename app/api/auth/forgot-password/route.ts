// app/api/auth/forgot-password/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    console.log("🔹 パスワードリセットリクエスト:", { email });

    if (!email) {
      return NextResponse.json(
        { error: "メールアドレスが必要です" },
        { status: 400 }
      );
    }

    // ユーザーを検索
    const user = await prisma.user.findUnique({ where: { email } });

    // セキュリティのため、ユーザーが存在しない場合でも同じメッセージを返す
    if (user) {
      // リセットトークンを生成
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // 1時間有効

      // データベースに保存
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires,
        },
      });

      console.log("✅ パスワードリセットトークンを生成:", {
        email: user.email,
        token: resetToken,
      });

      // TODO: ここでメールを送信する処理を追加
      // 今はデバッグのため、コンソールにトークンを出力
      console.log(
        "📧 パスワードリセットリンク: /reset-password?token=" + resetToken
      );
    }

    // セキュリティのため、常に成功メッセージを返す
    return NextResponse.json({
      message: "パスワードリセット用のリンクを送信しました",
    });
  } catch (error) {
    console.error("🚨 パスワードリセットリクエストエラー:", error);
    return NextResponse.json(
      { error: "パスワードリセットリクエストに失敗しました" },
      { status: 500 }
    );
  }
}
