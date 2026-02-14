// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;
    console.log("🔹 ログインリクエスト受信:", {
      hasEmail: !!email,
      hasPassword: !!password,
      emailType: typeof email,
      emailLength: String(email ?? "").length,
    });

    if (!email || !password) {
      console.error("🚨 リクエストに email または password がありません");
      return NextResponse.json(
        {
          error: "メールアドレス（またはユーザー名）とパスワードが必要です",
          reason: "MISSING_CREDENTIALS",
        },
        { status: 400 }
      );
    }

    // ユーザーを取得（@がない場合は name でも検索）
    const identifier = String(email ?? "").trim();
    const searchedBy = identifier.includes("@") ? "email" : "name_or_email";

    console.log("🔍 ユーザー検索開始:", { identifier, searchedBy });

    const whereClause = identifier.includes("@")
      ? { email: identifier }
      : { OR: [{ email: identifier }, { name: identifier }] };

    console.log("🔍 検索条件:", JSON.stringify(whereClause));

    const user = await prisma.user.findFirst({
      where: whereClause,
    });

    console.log("🔍 検索結果:", {
      foundUser: !!user,
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
    });

    if (!user) {
      console.error("🚨 ユーザーが見つかりません", { identifier, searchedBy });
      return NextResponse.json(
        {
          error: "ユーザーが見つかりません",
          reason: "USER_NOT_FOUND",
          searchedBy,
          identifier,
        },
        { status: 401 }
      );
    }

    console.log("✅ ユーザー情報:", user);

    // パスワードを比較
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.error("🚨 パスワードが間違っています", { userId: user.id });
      return NextResponse.json(
        { error: "パスワードが間違っています", reason: "INVALID_PASSWORD" },
        { status: 401 }
      );
    }

    if (!SECRET_KEY) {
      console.error("🚨 JWT_SECRET が設定されていません");
      return NextResponse.json(
        { error: "サーバーエラー: JWT_SECRET が未設定" },
        { status: 500 }
      );
    }

    // ✅ JWT を作成し、ユーザーIDを含める
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, {
      expiresIn: "10d",
    });

    console.log("✅ JWT 発行:", token);
    console.log("✅ userId を返す:", user.id);

    return NextResponse.json({
      token,
      userId: user.id,
      loginMatchedBy: searchedBy,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("🚨 ログインエラー:", err.message, err.stack);
    const isDev = process.env.NODE_ENV === "development";
    const detail = isDev ? err.message : undefined;
    return NextResponse.json(
      {
        error: "ログインに失敗しました",
        ...(detail && { detail, reason: "SERVER_ERROR" }),
      },
      { status: 500 }
    );
  }
}
