// app/api/admin/hide-messages-by-keywords/route.ts
// 管理者用API - キーワードを含む過去のメッセージを非表示にする

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHiddenKeywords, shouldHideMessage } from "@/lib/content-filter";

export async function POST(req: NextRequest) {
  console.log("🔍 POST /api/admin/hide-messages-by-keywords called");
  try {
    // 管理者認証
    const authHeader = req.headers.get("Authorization");
    console.log("🔍 Auth header:", authHeader ? "Present" : "Missing");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ Unauthorized: No auth header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);
    const expectedApiKey =
      process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123";

    console.log(
      "🔍 API Key check:",
      apiKey === expectedApiKey ? "Match" : "Mismatch"
    );

    if (apiKey !== expectedApiKey) {
      console.log("❌ Unauthorized: API key mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { dryRun = false } = body;

    // キーワードリストを取得
    const keywords = getHiddenKeywords();
    console.log("🔍 HIDDEN_KEYWORDS:", process.env.HIDDEN_KEYWORDS);
    console.log("🔍 Parsed keywords:", keywords);
    
    if (keywords.length === 0) {
      return NextResponse.json(
        {
          error: "HIDDEN_KEYWORDS environment variable is not set",
          details: `HIDDEN_KEYWORDS環境変数が設定されていません。.env.localファイルに HIDDEN_KEYWORDS=死にたい,自殺 のように設定してください。`,
        },
        { status: 400 }
      );
    }

    // 現在非表示でないメッセージを全て取得
    const allMessages = await prisma.sentMessage.findMany({
      where: {
        isHidden: false,
      },
      select: {
        id: true,
        message: true,
      },
    });

    console.log("🔍 Total messages found:", allMessages.length);

    // デバッグ: 最初の10件のメッセージをログに出力
    const sampleMessages = allMessages.slice(0, 10).map(m => m.message);
    console.log("🔍 Sample messages (first 10):", sampleMessages);

    // キーワードを含むメッセージをフィルタ
    const messagesToHide = allMessages.filter((msg) => {
      const shouldHide = shouldHideMessage(msg.message);
      if (shouldHide) {
        console.log("🔍 Found message to hide:", {
          id: msg.id,
          message: msg.message.substring(0, 50),
        });
      }
      return shouldHide;
    });

    console.log("🔍 Messages to hide count:", messagesToHide.length);

    if (dryRun) {
      // ドライラン: 実際には非表示にしない
      return NextResponse.json({
        success: true,
        dryRun: true,
        found: {
          totalMessages: allMessages.length,
          messagesToHide: messagesToHide.length,
          keywordList: keywords,
        },
        sampleMessages: messagesToHide.slice(0, 10).map((m) => ({
          id: m.id,
          message: m.message,
        })),
      });
    }

    // 実際に非表示にする
    const messageIds = messagesToHide.map((m) => m.id);
    if (messageIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "非表示にするメッセージはありませんでした",
        hidden: {
          count: 0,
        },
      });
    }

    // バッチ処理で更新（一度に多く更新するとタイムアウトする可能性があるため）
    const batchSize = 100;
    let totalUpdated = 0;

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const result = await prisma.sentMessage.updateMany({
        where: {
          id: { in: batch },
        },
        data: {
          isHidden: true,
        },
      });
      totalUpdated += result.count;
    }

    return NextResponse.json({
      success: true,
      hidden: {
        count: totalUpdated,
      },
      keywordList: keywords,
    });
  } catch (error) {
    console.error("🚨 キーワード非表示エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to hide messages by keywords",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
