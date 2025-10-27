// app/api/cron/digest-17/route.ts
// 改良版ダイジェスト通知API - 17時（JST）実行用

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import webpush, { PushSubscription as WebPushSubscription } from "web-push";

const prisma = new PrismaClient();

// バッチ処理で全ユーザーのフィード新着メッセージ数を効率的に取得
async function getAllUsersFeedNewCounts(): Promise<Map<string, number>> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // 1) 全てのFriend関係を取得
    const allFriends = await prisma.friend.findMany({
      select: {
        userId: true,
        friendId: true,
      },
    });

    // 2) 過去24時間以内の新着PresetMessageを取得
    const newPresetMessages = await prisma.presetMessage.findMany({
      where: {
        lastSentAt: { gte: twentyFourHoursAgo },
        count: { gt: 0 }, // 実際に送信されたメッセージのみ
      },
      select: {
        id: true,
        createdBy: true,
        lastSentAt: true,
      },
    });

    // 3) ユーザーごとのフィード対象ユーザーIDセットを作成
    const userFeedTargets = new Map<string, Set<string>>();

    // 全ユーザーを取得（自分自身も含める）
    const allUsers = await prisma.user.findMany({
      select: { id: true },
    });

    // 各ユーザーの初期化（自分自身を含める）
    allUsers.forEach((user) => {
      userFeedTargets.set(user.id, new Set([user.id]));
    });

    // Friend関係を追加
    allFriends.forEach((friend) => {
      const targetSet = userFeedTargets.get(friend.userId);
      if (targetSet) {
        targetSet.add(friend.friendId);
      }
    });

    // 4) ユーザーごとのフィード新着メッセージ数をカウント
    const userFeedCounts = new Map<string, number>();

    for (const [userId, targetUserIds] of userFeedTargets) {
      const count = newPresetMessages.filter((msg) =>
        targetUserIds.has(msg.createdBy)
      ).length;

      if (count > 0) {
        userFeedCounts.set(userId, count);
      }
    }

    return userFeedCounts;
  } catch (error) {
    console.error("Error in getAllUsersFeedNewCounts:", error);
    return new Map();
  }
}

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

    // 1) 効率的に全ユーザーの未マッチ数とフィード新着数を取得
    const [userUnmatchedCounts, userFeedNewCounts] = await Promise.all([
      getAllUsersUnmatchedCounts(),
      getAllUsersFeedNewCounts(),
    ]);

    console.log(
      `📊 Processed ${userUnmatchedCounts.size} users with unmatched messages`
    );
    console.log(
      `📊 Processed ${userFeedNewCounts.size} users with feed new messages`
    );

    // 通知対象ユーザーの統合（未マッチまたはフィード新着があるユーザー）
    const allTargetUserIds = new Set([
      ...userUnmatchedCounts.keys(),
      ...userFeedNewCounts.keys(),
    ]);

    if (allTargetUserIds.size === 0) {
      console.log("📭 No users with notifications to send");
      return NextResponse.json({
        ok: true,
        message: "No notifications to send",
        stats: {
          processed: 0,
          sent: 0,
          deactivated: 0,
          executionTimeMs: Date.now() - startTime,
        },
      });
    }

    // 2) アクティブな購読を取得（通知対象ユーザーのみ）
    // 購読を取得する際にcreatedAtも含める
    const allActiveSubsWithDate = await prisma.pushSubscription.findMany({
      where: {
        isActive: true,
        userId: { in: Array.from(allTargetUserIds) },
      },
      select: {
        endpoint: true,
        subscription: true,
        userId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" }, // 最新順にソート
    });

    if (allActiveSubsWithDate.length === 0) {
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
      { endpoint: string; subscription: unknown; createdAt: Date }[]
    >();

    allActiveSubsWithDate.forEach((sub) => {
      const subs = subsByUser.get(sub.userId) || [];
      subs.push({
        endpoint: sub.endpoint,
        subscription: sub.subscription,
        createdAt: sub.createdAt,
      });
      subsByUser.set(sub.userId, subs);
    });

    // 各ユーザーについて、最新の購読以外を無効化候補に追加
    const oldEndpointsToDeactivate = new Set<string>();
    for (const [userId, subs] of subsByUser) {
      if (subs.length > 1) {
        // 最新の購読を除いて、古い購読を無効化
        const sortedSubs = subs.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const latestSubscription = sortedSubs[0];

        // 最新以外を無効化対象に追加
        for (let i = 1; i < sortedSubs.length; i++) {
          oldEndpointsToDeactivate.add(sortedSubs[i].endpoint);
        }
      }
    }

    // 古い購読を無効化
    if (oldEndpointsToDeactivate.size > 0) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: Array.from(oldEndpointsToDeactivate) } },
        data: { isActive: false },
      });
      console.log(
        `🗑️ Deactivated ${oldEndpointsToDeactivate.size} old subscriptions (multiple subscriptions per user)`
      );
    }

    const endpointsToDeactivate = new Set<string>();
    let notificationsSent = 0;
    let usersNotified = 0;

    // 4) 通知送信（各ユーザーに対して最新の購読のみに送信）
    for (const [userId, subs] of subsByUser) {
      // 最新の購読のみを取得（既にソート済み）
      const latestSub = subs.length > 0 ? [subs[0]] : [];

      if (latestSub.length === 0) continue;

      const unmatchedCount = userUnmatchedCounts.get(userId) || 0;
      const feedNewCount = userFeedNewCounts.get(userId) || 0;

      // 未マッチメッセージ通知
      if (unmatchedCount > 0) {
        const notificationBody =
          unmatchedCount === 1
            ? "あなたに誰かからメッセージが来ています（24時間以内）"
            : "あなたに誰かから複数のメッセージが来ています（24時間以内）";

        const payload = JSON.stringify({
          type: "digest_unmatched",
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

        const deactivated = await sendToSubsBatch(latestSub, payload);
        deactivated.forEach((ep) => endpointsToDeactivate.add(ep));

        const successfulSends = latestSub.length - deactivated.length;
        if (successfulSends > 0) {
          notificationsSent += successfulSends;
          console.log(
            `📱 Sent unmatched notification to user ${userId}: ${unmatchedCount} messages`
          );
        }
      }

      // フィード新着メッセージ通知
      if (feedNewCount > 0) {
        const feedPayload = JSON.stringify({
          type: "digest_feed",
          title: "新着メッセージ",
          body: `今日はこれまでに${feedNewCount}件の新しいメッセージが追加されました`,
          url: "/main",
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-144x144.png",
          timestamp: Date.now(),
          data: {
            feedNewCount,
            userId,
          },
        });

        const feedDeactivated = await sendToSubsBatch(latestSub, feedPayload);
        feedDeactivated.forEach((ep) => endpointsToDeactivate.add(ep));

        const feedSuccessfulSends = latestSub.length - feedDeactivated.length;
        if (feedSuccessfulSends > 0) {
          notificationsSent += feedSuccessfulSends;
          console.log(
            `📱 Sent feed notification to user ${userId}: ${feedNewCount} new messages`
          );
        }
      }

      // ユーザーが何らかの通知を受け取った場合のカウント
      if (unmatchedCount > 0 || feedNewCount > 0) {
        usersNotified++;
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
        usersWithFeedNewMessages: userFeedNewCounts.size,
        totalTargetUsers: allTargetUserIds.size,
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
