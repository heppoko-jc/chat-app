// app/api/auth/consent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const SECRET_KEY: string = process.env.JWT_SECRET || "";

if (!SECRET_KEY) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

// 同意情報を保存
export async function POST(req: NextRequest) {
  try {
    const {
      email,
      participantName,
      consentDate,
      participation,
      interview,
      dataUsage,
      recordingConsent,
    } = await req.json();

    console.log("同意情報を保存:", {
      email,
      participantName,
      consentDate,
      participation,
      interview,
      dataUsage,
      recordingConsent,
    });

    // メールアドレスでユーザーを検索
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    // 同意情報を更新
    user = await prisma.user.update({
      where: { email },
      data: {
        participantName: participantName || null,
        consentDate: consentDate ? new Date(consentDate) : null,
        consentParticipated: participation ?? null,
        consentInterview: interview ?? null,
        consentDataUsage: dataUsage ?? null,
        consentRecording: recordingConsent ?? null,
      },
    });

    console.log("同意情報の保存完了:", user.email);

    return NextResponse.json({
      message: "同意情報を保存しました",
      user: {
        id: user.id,
        email: user.email,
        participantName: user.participantName,
      },
    });
  } catch (error) {
    console.error("同意情報の保存エラー:", error);
    return NextResponse.json(
      { error: "同意情報の保存に失敗しました" },
      { status: 500 }
    );
  }
}

// 同意情報を取得
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    
    // JWT検証
    try {
      jwt.verify(token, SECRET_KEY) as { id: string };
    } catch (err: unknown) {
      if (err instanceof jwt.TokenExpiredError) {
        console.warn("Consent fetch warning: JWT expired", err);
        return NextResponse.json({ error: "Token expired" }, { status: 401 });
      } else {
        console.error("Consent fetch error: Invalid token", err);
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    }
    
    const users = await prisma.user.findMany({
      where: {
        participantName: { not: null },
        consentDate: { not: null },
      },
      select: {
        id: true,
        email: true,
        name: true,
        participantName: true,
        consentDate: true,
        consentParticipated: true,
        consentInterview: true,
        consentDataUsage: true,
        consentRecording: true,
        createdAt: true,
      },
      orderBy: {
        consentDate: "desc",
      },
    });

    return NextResponse.json({ consents: users });
  } catch (error) {
    console.error("同意情報の取得エラー:", error);
    return NextResponse.json(
      { error: "同意情報の取得に失敗しました" },
      { status: 500 }
    );
  }
}
