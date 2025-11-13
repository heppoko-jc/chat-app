// app/api/admin/broadcast/route.ts

import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

// VAPIDキーの検証
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  console.error("❌ VAPID keys are not set in environment variables");
} else {
  webpush.setVapidDetails(
    "mailto:you@domain.com",
    vapidPublicKey,
    vapidPrivateKey
  );
}

export async function POST(req: NextRequest) {
  try {
    // 簡単なAPIキー認証（環境変数で設定）
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const apiKey = authHeader.slice(7);
    const expectedApiKey =
      process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123";

    if (apiKey !== expectedApiKey) {
      console.error("❌ Invalid API key provided");
      return NextResponse.json(
        { error: "Unauthorized: Invalid API key" },
        { status: 401 }
      );
    }

    // VAPIDキーのチェック
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("❌ VAPID keys are not configured");
      return NextResponse.json(
        {
          error:
            "VAPID keys are not configured. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.",
        },
        { status: 500 }
      );
    }

    const { title, body, url = "/", type = "update" } = await req.json();

    if (!title || !body) {
      return NextResponse.json(
        { error: "Title and body are required" },
        { status: 400 }
      );
    }

    // アクティブなプッシュ購読を取得
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { isActive: true },
      select: { endpoint: true, subscription: true },
    });

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active subscriptions found",
        stats: {
          total: 0,
          success: 0,
          failed: 0,
          deactivated: 0,
        },
      });
    }

    // 通知ペイロードを作成
    const payload = JSON.stringify({
      type,
      title,
      body,
      url,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-144x144.png",
      timestamp: Date.now(),
    });

    // バッチ処理で安全に送信（一度に50件ずつ）
    const BATCH_SIZE = 50;
    const results = [];

    for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
      const batch = subscriptions.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((sub) =>
          webpush
            .sendNotification(
              sub.subscription as unknown as webpush.PushSubscription,
              payload
            )
            .catch((error) => {
              // エラーを詳細にログ出力
              console.error(
                `Failed to send notification to ${sub.endpoint}:`,
                error
              );
              throw error;
            })
        )
      );
      results.push(...batchResults);

      // バッチ間で少し待機（レート制限回避）
      if (i + BATCH_SIZE < subscriptions.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // 失敗した購読を無効化
    const failedEndpoints: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const error = result.reason;
        console.error(
          `Notification failed for endpoint ${subscriptions[index].endpoint}:`,
          error?.statusCode || error?.message || error
        );
        // 404, 410のほか、401（認証エラー）も無効化対象
        if (
          error?.statusCode === 404 ||
          error?.statusCode === 410 ||
          error?.statusCode === 401
        ) {
          failedEndpoints.push(subscriptions[index].endpoint);
        }
      }
    });

    // 無効な購読をDBから無効化
    if (failedEndpoints.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: failedEndpoints } },
        data: { isActive: false },
      });
    }

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
      success: true,
      message: `Broadcast sent to ${successCount} users`,
      stats: {
        total: subscriptions.length,
        success: successCount,
        failed: failureCount,
        deactivated: failedEndpoints.length,
      },
    });
  } catch (error) {
    console.error("🚨 Broadcast push error:", error);
    // エラーメッセージを詳細に返す
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // 開発環境ではスタックトレースも含める
    if (process.env.NODE_ENV === "development") {
      console.error("Error stack:", errorStack);
    }

    return NextResponse.json(
      {
        error: "Failed to send broadcast",
        details: errorMessage,
        ...(process.env.NODE_ENV === "development" && { stack: errorStack }),
      },
      { status: 500 }
    );
  }
}
