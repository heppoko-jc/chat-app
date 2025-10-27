// app/api/auth/register/route.ts

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, consentInfo } = await req.json();

    // 既に登録されているか確認
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: "This email is already in use." }, { status: 400 });
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザーを作成（同意情報も含む）
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        // 同意情報がある場合、保存
        participantName: consentInfo?.participantName || null,
        consentDate: consentInfo?.consentDate ? new Date(consentInfo.consentDate) : null,
        consentParticipated: consentInfo?.participation ?? null,
        consentInterview: consentInfo?.interview ?? null,
        consentDataUsage: consentInfo?.dataUsage ?? null,
        consentRecording: consentInfo?.recordingConsent ?? null,
      },
    });

    console.log("ユーザー登録完了:", {
      email: user.email,
      participantName: user.participantName,
      consentDate: user.consentDate,
    });

    return NextResponse.json({ message: "User registered successfully!", user});
  } catch (error) {
    console.error("Registration Error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}