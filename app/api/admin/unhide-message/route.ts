// app/api/admin/unhide-message/route.ts
// 管理者用API - 非表示にしたメッセージを再表示する

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    // 管理者認証
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);
    const expectedApiKey =
      process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123";

    if (apiKey !== expectedApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messageId, messageIds } = await req.json();
    const ids = messageIds || (messageId ? [messageId] : []);

    if (!ids.length) {
      return NextResponse.json(
        { error: "messageId or messageIds is required" },
        { status: 400 }
      );
    }

    // 非表示を解除
    const updateResult = await prisma.sentMessage.updateMany({
      where: {
        id: { in: ids },
        isHidden: true, // 非表示のもののみ
      },
      data: {
        isHidden: false,
      },
    });

    return NextResponse.json({
      success: true,
      unhidden: {
        count: updateResult.count,
      },
    });
  } catch (error) {
    console.error("🚨 メッセージ再表示エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to unhide message",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
