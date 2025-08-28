import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const SECRET_KEY = process.env.JWT_SECRET;

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    console.log("🔹 ログインリクエスト:", { email, password });

    // ユーザーを取得
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.error("🚨 ユーザーが見つかりません");
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 401 });
    }

    console.log("✅ ユーザー情報:", user);

    // パスワードを比較
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.error("🚨 パスワードが間違っています");
      return NextResponse.json({ error: "パスワードが間違っています" }, { status: 401 });
    }

    if (!SECRET_KEY) {
      console.error("🚨 JWT_SECRET が設定されていません");
      return NextResponse.json({ error: "サーバーエラー: JWT_SECRET が未設定" }, { status: 500 });
    }

    // ✅ JWT を作成し、ユーザーIDを含める
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: "10d" });

    console.log("✅ JWT 発行:", token);
    console.log("✅ userId を返す:", user.id);

    return NextResponse.json({ token, userId: user.id });
  } catch (error) {
    console.error("🚨 ログインエラー:", error);
    return NextResponse.json({ error: "ログインに失敗しました" }, { status: 500 });
  }
}