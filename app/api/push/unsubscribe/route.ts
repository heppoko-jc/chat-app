// app/api/push/unsubscribe/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    // Authorization ヘッダーの検証
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userId = verifyJwt(token);

    // リクエストボディから endpoint を取得
    const { endpoint } = await req.json();
    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    // DB 上の該当レコードを無効化（isActive=false）
    await prisma.pushSubscription.updateMany({
      where: { userId, endpoint },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🚨 Push unsubscribe error:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe from push" },
      { status: 500 }
    );
  }
}
