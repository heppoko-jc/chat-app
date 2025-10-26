// app/api/cron/digest-17/route.ts
// 改良版ダイジェスト通知API - 17時（JST）実行用

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import webpush, { PushSubscription as WebPushSubscription } from "web-push";

const prisma = new PrismaClient();

// バッチ処理で全ユーザーの未マッチメッセージ数を効率的に取得
async function getAllUsersUnmatchedCounts(): Promise<Map<string, number>> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // 1) 24時間以内の受信メッセージを全て取得
    const recentMessages = await prisma.sentMessage.findMany({
      where: {
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: {
        receiverId: true,
        senderId: true,
        message: true,
      },
    });

    // 2) 全てのマッチペアを取得
    const allMatches = await prisma.matchPair.findMany({
      select: {
        user1Id: true,
        user2Id: true,
        message: true,
      },
    });

    // 3) マッチ済みメッセージのセットを作成
    const matchedSet = new Set<string>();
    allMatches.forEach((match) => {
      matchedSet.add(`${match.message}-${match.user1Id}-${match.user2Id}`);
      matchedSet.add(`${match.message}-${match.user2Id}-${match.user1Id}`);
    });

    // 4) ユーザーごとの未マッチ数をカウント
    const userCounts = new Map<string, number>();

    recentMessages.forEach((msg) => {
      const key = `${msg.message}-${msg.senderId}-${msg.receiverId}`;
      if (!matchedSet.has(key)) {
        const current = userCounts.get(msg.receiverId) || 0;
        userCounts.set(msg.receiverId, current + 1);
      }
    });

    return userCounts;
  } catch (error) {
    console.error("Error in getAllUsersUnmatchedCounts:", error);
    return new Map();
  }
}

webpush.setVapidDetails(
  "mailto:you@domain.com",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function getStatusCode(reason: unknown): number | undefined {
  if (typeof reason === "object" && reason !== null) {
    const val = (reason as Record<string, unknown>)["statusCode"];
    if (typeof val === "number") return val;
  }
  return undefined;
}

// バッチサイズを小さくして安全性を向上
const NOTIFICATION_BATCH_SIZE = 20;

async function sendToSubsBatch(
  subs: { endpoint: string; subscription: unknown }[],
  payload: string
): Promise<string[]> {
  const toDeactivate: string[] = [];

  // バッチ処理で送信
  for (let i = 0; i < subs.length; i += NOTIFICATION_BATCH_SIZE) {
    const batch = subs.slice(i, i + NOTIFICATION_BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((s) =>
        webpush.sendNotification(s.subscription as WebPushSubscription, payload)
      )
    );

    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        const code = getStatusCode(r.reason);
        if (code === 404 || code === 410) {
          toDeactivate.push(batch[idx].endpoint);
        }
      }
    });

    // バッチ間で少し待機（レート制限対策）
    if (i + NOTIFICATION_BATCH_SIZE < subs.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return toDeactivate;
}

export async function GET() {
  const startTime = Date.now();

  try {
    console.log("🚀 Digest notification started (17:00 JST)");

    // 1) 効率的に全ユーザーの未マッチ数を取得
    const userUnmatchedCounts = await getAllUsersUnmatchedCounts();
    console.log(
      `📊 Processed ${userUnmatchedCounts.size} users with unmatched messages`
    );

    if (userUnmatchedCounts.size === 0) {
      console.log("📭 No users with unmatched messages found");
      return NextResponse.json({
        ok: true,
        message: "No unmatched messages found",
        stats: {
          processed: 0,
          sent: 0,
          deactivated: 0,
          executionTimeMs: Date.now() - startTime,
        },
      });
    }

    // 2) アクティブな購読を取得（未マッチメッセージがあるユーザーのみ）
    const allActiveSubs = await prisma.pushSubscription.findMany({
      where: {
        isActive: true,
        userId: { in: Array.from(userUnmatchedCounts.keys()) },
      },
      select: { endpoint: true, subscription: true, userId: true },
    });

    if (allActiveSubs.length === 0) {
      console.log(
        "📭 No active subscriptions found for users with unmatched messages"
      );
      return NextResponse.json({
        ok: true,
        message: "No active subscriptions to send notifications to",
        stats: {
          processed: userUnmatchedCounts.size,
          sent: 0,
          deactivated: 0,
          executionTimeMs: Date.now() - startTime,
        },
      });
    }

    // 3) ユーザーごとに購読をグループ化
    const subsByUser = new Map<
      string,
      { endpoint: string; subscription: unknown }[]
    >();
    allActiveSubs.forEach((sub) => {
      const subs = subsByUser.get(sub.userId) || [];
      subs.push({ endpoint: sub.endpoint, subscription: sub.subscription });
      subsByUser.set(sub.userId, subs);
    });

    const endpointsToDeactivate = new Set<string>();
    let notificationsSent = 0;
    let usersNotified = 0;

    // 4) 通知送信
    for (const [userId, subs] of subsByUser) {
      const unmatchedCount = userUnmatchedCounts.get(userId) || 0;
      if (unmatchedCount === 0) continue;

      // 通知メッセージの決定
      const notificationBody =
        unmatchedCount === 1
          ? "あなたに誰かからメッセージが来ています（24時間以内）"
          : "あなたに誰かから複数のメッセージが来ています（24時間以内）";

      const payload = JSON.stringify({
        type: "digest_user",
        title: "新着メッセージ",
        body: notificationBody,
        url: "/notifications",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-144x144.png",
        timestamp: Date.now(),
        data: {
          unmatchedCount,
          userId,
        },
      });

      const deactivated = await sendToSubsBatch(subs, payload);
      deactivated.forEach((ep) => endpointsToDeactivate.add(ep));

      const successfulSends = subs.length - deactivated.length;
      if (successfulSends > 0) {
        notificationsSent += successfulSends;
        usersNotified++;
        console.log(
          `📱 Sent notification to user ${userId}: ${unmatchedCount} unmatched messages`
        );
      }
    }

    // 5) 無効な購読を削除
    if (endpointsToDeactivate.size > 0) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: Array.from(endpointsToDeactivate) } },
        data: { isActive: false },
      });
      console.log(
        `🗑️ Deactivated ${endpointsToDeactivate.size} invalid subscriptions`
      );
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Digest notification completed in ${executionTime}ms`);
    console.log(
      `📈 Stats: ${usersNotified} users notified, ${notificationsSent} notifications sent`
    );

    return NextResponse.json({
      ok: true,
      message: `Successfully sent notifications to ${usersNotified} users`,
      stats: {
        usersWithUnmatchedMessages: userUnmatchedCounts.size,
        usersNotified,
        notificationsSent,
        deactivated: endpointsToDeactivate.size,
        executionTimeMs: executionTime,
      },
    });
  } catch (err) {
    const executionTime = Date.now() - startTime;
    console.error("🚨 Digest notification failed:", err);
    console.error(`💥 Failed after ${executionTime}ms`);

    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
        executionTimeMs: executionTime,
      },
      { status: 500 }
    );
  } finally {
    // Prismaクライアントを適切にクリーンアップ
    await prisma.$disconnect();
  }
}
