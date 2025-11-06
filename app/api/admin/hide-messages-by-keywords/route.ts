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

    // ✅ SentMessageテーブルから検索（マッチメッセージ用）
    const sentMessages = await prisma.sentMessage.findMany({
      where: {
        isHidden: false,
      },
      select: {
        id: true,
        message: true,
      },
    });

    console.log("🔍 SentMessage total found:", sentMessages.length);

    // ✅ PresetMessageテーブルからも検索（PresetMessageリストに表示されるメッセージ）
    const presetMessages = await prisma.presetMessage.findMany({
      select: {
        id: true,
        content: true,
      },
    });

    console.log("🔍 PresetMessage total found:", presetMessages.length);

    // 両方のメッセージを結合してキーワードチェック
    const allMessages = [
      ...sentMessages.map((m) => ({ id: m.id, message: m.message, type: "sent" as const })),
      ...presetMessages.map((m) => ({ id: m.id, message: m.content, type: "preset" as const })),
    ];

    console.log("🔍 Total messages (SentMessage + PresetMessage):", allMessages.length);

    // デバッグ: 最初の10件のメッセージをログに出力
    const sampleMessages = allMessages.slice(0, 10).map(m => m.message);
    console.log("🔍 Sample messages (first 10):", sampleMessages);

    // キーワードを含むメッセージをフィルタ
    const messagesToHide = allMessages.filter((msg) => {
      const shouldHide = shouldHideMessage(msg.message);
      if (shouldHide) {
        console.log("🔍 Found message to hide:", {
          id: msg.id,
          type: msg.type,
          message: msg.message.substring(0, 50),
        });
      }
      return shouldHide;
    });

    console.log("🔍 Messages to hide count:", messagesToHide.length);
    console.log("🔍 Breakdown by type:", {
      sent: messagesToHide.filter(m => m.type === "sent").length,
      preset: messagesToHide.filter(m => m.type === "preset").length,
    });

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
    const sentMessagesToHide = messagesToHide.filter((m) => m.type === "sent");
    const presetMessagesToHide = messagesToHide.filter((m) => m.type === "preset");

    if (sentMessagesToHide.length === 0 && presetMessagesToHide.length === 0) {
      return NextResponse.json({
        success: true,
        message: "非表示にするメッセージはありませんでした",
        hidden: {
          count: 0,
        },
      });
    }

    // SentMessageを非表示にする
    let sentMessageCount = 0;
    if (sentMessagesToHide.length > 0) {
      const sentMessageIds = sentMessagesToHide.map((m) => m.id);
      const batchSize = 100;

      for (let i = 0; i < sentMessageIds.length; i += batchSize) {
        const batch = sentMessageIds.slice(i, i + batchSize);
        const result = await prisma.sentMessage.updateMany({
          where: {
            id: { in: batch },
          },
          data: {
            isHidden: true,
          },
        });
        sentMessageCount += result.count;
      }
    }

    // PresetMessageに対応するSentMessageを非表示にする
    // （PresetMessage自体は削除せず、対応するSentMessageを非表示にする）
    let presetMessageCount = 0;
    if (presetMessagesToHide.length > 0) {
      const presetContents = presetMessagesToHide.map((m) => m.message);
      const batchSize = 100;

      for (let i = 0; i < presetContents.length; i += batchSize) {
        const batch = presetContents.slice(i, i + batchSize);
        const result = await prisma.sentMessage.updateMany({
          where: {
            message: { in: batch },
            isHidden: false, // まだ非表示でないもののみ
          },
          data: {
            isHidden: true,
          },
        });
        presetMessageCount += result.count;
      }
    }

    return NextResponse.json({
      success: true,
      hidden: {
        sentMessages: sentMessageCount,
        presetMessages: presetMessageCount,
        total: sentMessageCount + presetMessageCount,
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
