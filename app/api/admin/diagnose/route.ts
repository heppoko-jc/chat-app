// app/api/admin/diagnose/route.ts
// 診断用API - プッシュ通知の状態を確認

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // 簡単な認証チェック（本番環境では実装してください）
    // const authHeader = req.headers.get("Authorization");
    // const adminKey = req.headers.get("X-Admin-Key");

    // 認証をスキップ（開発・診断用）
    // 本番環境では必ず認証を実装してください

    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      environment: {
        node_env: process.env.NODE_ENV,
        has_vapid_public: !!process.env.VAPID_PUBLIC_KEY,
        has_vapid_private: !!process.env.VAPID_PRIVATE_KEY,
        has_next_pub_vapid: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      },
    };

    // 1. アクティブなプッシュ購読の数を取得
    try {
      const activeSubscriptions = await prisma.pushSubscription.findMany({
        where: { isActive: true },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          createdAt: true,
        },
      });

      results.push_subscriptions = {
        total_active: activeSubscriptions.length,
        unique_users: new Set(activeSubscriptions.map((s) => s.userId)).size,
        subscriptions: activeSubscriptions.slice(0, 5), // 最初の5件のみ表示
      };
    } catch (error) {
      results.push_subscriptions_error =
        error instanceof Error ? error.message : String(error);
    }

    // 2. 過去24時間のメッセージ数を確認
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [recentSentMessages, recentPresetMessages, totalUsers] =
        await Promise.all([
          prisma.sentMessage.findMany({
            where: {
              createdAt: { gte: twentyFourHoursAgo },
            },
            select: {
              id: true,
              senderId: true,
              receiverId: true,
              createdAt: true,
            },
          }),
          prisma.presetMessage.findMany({
            where: {
              lastSentAt: { gte: twentyFourHoursAgo },
              count: { gt: 0 },
            },
            select: {
              id: true,
              createdBy: true,
              lastSentAt: true,
              count: true,
            },
          }),
          prisma.user.count(),
        ]);

      results.messages = {
        sent_messages_24h: recentSentMessages.length,
        unique_receivers: new Set(recentSentMessages.map((m) => m.receiverId))
          .size,
        preset_messages_24h: recentPresetMessages.length,
        total_users: totalUsers,
      };
    } catch (error) {
      results.messages_error =
        error instanceof Error ? error.message : String(error);
    }

    // 3. 未マッチメッセージの概算を計算
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [recentMessages, allMatches] = await Promise.all([
        prisma.sentMessage.findMany({
          where: { createdAt: { gte: twentyFourHoursAgo } },
          select: {
            receiverId: true,
            senderId: true,
            message: true,
          },
        }),
        prisma.matchPair.findMany({
          select: {
            user1Id: true,
            user2Id: true,
            message: true,
          },
        }),
      ]);

      // マッチ済みメッセージのセットを作成
      const matchedSet = new Set<string>();
      allMatches.forEach((match) => {
        matchedSet.add(`${match.message}-${match.user1Id}-${match.user2Id}`);
        matchedSet.add(`${match.message}-${match.user2Id}-${match.user1Id}`);
      });

      // 未マッチ数をカウント
      const unmatchedCount = recentMessages.filter((msg) => {
        const key = `${msg.message}-${msg.senderId}-${msg.receiverId}`;
        return !matchedSet.has(key);
      }).length;

      results.unmatched_messages = {
        total_recent_messages: recentMessages.length,
        unmatched_count: unmatchedCount,
        matched_count: recentMessages.length - unmatchedCount,
      };
    } catch (error) {
      results.unmatched_error =
        error instanceof Error ? error.message : String(error);
    }

    // 4. フィード新着メッセージの概算
    try {
      const allFriends = await prisma.friend.findMany({
        select: {
          userId: true,
          friendId: true,
        },
      });

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const newPresetMessages = await prisma.presetMessage.findMany({
        where: {
          lastSentAt: { gte: twentyFourHoursAgo },
          count: { gt: 0 },
        },
        select: {
          id: true,
          createdBy: true,
          lastSentAt: true,
        },
      });

      // ユーザーごとのフィード対象ユーザーIDセットを作成
      const userFeedTargets = new Map<string, Set<string>>();
      const allUsers = await prisma.user.findMany({
        select: { id: true },
      });

      allUsers.forEach((user) => {
        userFeedTargets.set(user.id, new Set([user.id]));
      });

      allFriends.forEach((friend) => {
        const targetSet = userFeedTargets.get(friend.userId);
        if (targetSet) {
          targetSet.add(friend.friendId);
        }
      });

      // ユーザーごとのフィード新着メッセージ数をカウント
      const userFeedCounts = new Map<string, number>();

      for (const [userId, targetUserIds] of userFeedTargets) {
        const count = newPresetMessages.filter((msg) =>
          targetUserIds.has(msg.createdBy)
        ).length;

        if (count > 0) {
          userFeedCounts.set(userId, count);
        }
      }

      results.feed_messages = {
        total_users_with_feed_new: userFeedCounts.size,
        users_with_counts: Object.fromEntries(
          Array.from(userFeedCounts.entries()).slice(0, 10)
        ),
      };
    } catch (error) {
      results.feed_error =
        error instanceof Error ? error.message : String(error);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Diagnose error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
