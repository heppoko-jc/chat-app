// app/api/admin/broadcast/route.ts

import { NextRequest, NextResponse } from "next/server";
import webpush, { PushSubscription as WebPushSubscription } from "web-push";
import { prisma } from "@/lib/prisma";

// VAPIDキー（必須）
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  console.error("❌ VAPID keys are not set in environment variables");
} else {
  webpush.setVapidDetails("mailto:you@domain.com", vapidPublicKey, vapidPrivateKey);
}

// web-push のエラーから statusCode を安全に取り出すヘルパー（no-explicit-any回避）
function getStatusCode(reason: unknown): number | undefined {
  if (typeof reason === "object" && reason !== null && "statusCode" in reason) {
    const val = (reason as { statusCode?: unknown }).statusCode;
    if (typeof val === "number") return val;
  }
  return undefined;
}

// 複数購読へ push を送り、404/410 を拾って「無効化すべき endpoint」を返す
async function sendToSubsBatch(
  subs: { endpoint: string; subscription: unknown }[],
  payload: string
): Promise<string[]> {
  const toDeactivate: string[] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < subs.length; i += BATCH_SIZE) {
    const batch = subs.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((s) =>
        webpush.sendNotification(s.subscription as WebPushSubscription, payload)
      )
    );

    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        const error = r.reason;
        const code = getStatusCode(error);
        const body =
          typeof error === "object" &&
          error !== null &&
          "body" in error &&
          typeof (error as { body?: unknown }).body === "string"
            ? ((error as { body?: string }).body as string)
            : "";

        // Apple Web Push の VAPID 公開鍵不一致 (400)
        const isVapidMismatch =
          code === 400 && body.includes("VapidPkHashMismatch");

        // 404 / 410 / 400(VAPID不一致) を無効化対象にする
        if (code === 404 || code === 410 || isVapidMismatch) {
          toDeactivate.push(batch[idx].endpoint);
        } else {
          // それ以外のエラーはログだけ出して購読は残す（他のAPIと同じ方針）
          console.error("[broadcast] push error:", code, error);
        }
      }
    });

    // バッチ間で少し待機（レート制限対策）
    if (i + BATCH_SIZE < subs.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return toDeactivate;
}

export async function POST(req: NextRequest) {
  try {
    // --- 認証（管理用APIキー）---
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

    // --- VAPID キー確認 ---
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("❌ VAPID keys are not configured");
      return NextResponse.json(
        {
          error:
            "VAPID keys are not configured. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
        },
        { status: 500 }
      );
    }

    // --- リクエストボディ ---
    const { title, body, url = "/", type = "update" } = await req.json();

    if (!title || !body) {
      return NextResponse.json(
        { error: "Title and body are required" },
        { status: 400 }
      );
    }

    // --- アクティブな購読を取得 ---
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

    // --- ペイロード作成 ---
    const payload = JSON.stringify({
      type,
      title,
      body,
      url,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-144x144.png",
      timestamp: Date.now(),
    });

    // --- 一括送信 ---
    const endpointsToDeactivate = await sendToSubsBatch(subscriptions, payload);

    if (endpointsToDeactivate.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: endpointsToDeactivate } },
        data: { isActive: false },
      });
    }

    const failureCount = endpointsToDeactivate.length;
    const successCount = subscriptions.length - failureCount;

    return NextResponse.json({
      success: true,
      message: `Broadcast sent to ${successCount} users`,
      stats: {
        total: subscriptions.length,
        success: successCount,
        failed: failureCount,
        deactivated: endpointsToDeactivate.length,
      },
    });
  } catch (error) {
    console.error("🚨 Broadcast push error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to send broadcast", details: message },
      { status: 500 }
    );
  }
}
