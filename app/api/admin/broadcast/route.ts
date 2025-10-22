// app/api/admin/broadcast/route.ts

import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

webpush.setVapidDetails(
  "mailto:you@domain.com",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 簡単なAPIキー認証（環境変数で設定）
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
          webpush.sendNotification(
            sub.subscription as unknown as webpush.PushSubscription,
            payload
          )
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
        if (error.statusCode === 404 || error.statusCode === 410) {
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
    return NextResponse.json(
      { error: "Failed to send broadcast" },
      { status: 500 }
    );
  }
}
