// app/api/auth/change-password/route.ts

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SECRET_KEY: string = process.env.JWT_SECRET || "";

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

// パスワード変更
export async function PUT(req: NextRequest) {
  try {
    const { currentPassword, newPassword } = await req.json();

    // バリデーション
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "現在のパスワードと新しいパスワードが必要です" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "新しいパスワードは6文字以上である必要があります" },
        { status: 400 }
      );
    }

    // 認証ヘッダーを確認
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    let decoded: { id: string };

    try {
      decoded = jwt.verify(token, SECRET_KEY) as { id: string };
    } catch (err: unknown) {
      if (err instanceof jwt.TokenExpiredError) {
        console.warn("Change password warning: JWT expired", err);
        return NextResponse.json({ error: "Token expired" }, { status: 401 });
      } else {
        console.error("Change password error: Invalid token", err);
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }

    // ユーザーを取得（パスワードも含む）
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { password: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 現在のパスワードを検証
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 400 }
      );
    }

    // 新しいパスワードをハッシュ化
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // パスワードを更新
    await prisma.user.update({
      where: { id: decoded.id },
      data: { password: hashedNewPassword },
    });

    return NextResponse.json({ message: "パスワードが正常に変更されました" });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "パスワードの変更に失敗しました" },
      { status: 500 }
    );
  }
}
