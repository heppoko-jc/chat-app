// app/api/export/route.ts

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // 全てのテーブルのデータを取得
    const [
      users,
      presetMessages,
      sentMessages,
      matchPairs,
      chats,
      messages,
      pushSubscriptions,
    ] = await Promise.all([
      // ユーザー
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          bio: true,
          createdAt: true,
        },
      }),

      // プリセットメッセージ
      prisma.presetMessage.findMany(),

      // 送信メッセージ
      prisma.sentMessage.findMany({
        include: {
          sender: { select: { name: true } },
          receiver: { select: { name: true } },
        },
      }),

      // マッチペア
      prisma.matchPair.findMany({
        include: {
          user1: { select: { name: true } },
          user2: { select: { name: true } },
        },
      }),

      // チャット
      prisma.chat.findMany({
        include: {
          user1: { select: { name: true } },
          user2: { select: { name: true } },
        },
      }),

      // チャットメッセージ
      prisma.message.findMany({
        include: {
          sender: { select: { name: true } },
          chat: { select: { id: true } },
        },
      }),

      // プッシュ通知
      prisma.pushSubscription.findMany({
        select: {
          id: true,
          userId: true,
          endpoint: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    // エクスポートデータを整理
    const exportData = {
      summary: {
        exportDate: new Date().toISOString(),
        totalUsers: users.length,
        totalPresetMessages: presetMessages.length,
        totalSentMessages: sentMessages.length,
        totalMatchPairs: matchPairs.length,
        totalChats: chats.length,
        totalMessages: messages.length,
        totalPushSubscriptions: pushSubscriptions.length,
      },
      users,
      presetMessages,
      sentMessages,
      matchPairs,
      chats,
      messages,
      pushSubscriptions,
    };

    return NextResponse.json(exportData, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="database-export-${
          new Date().toISOString().split("T")[0]
        }.json"`,
      },
    });
  } catch (error) {
    console.error("エクスポートエラー:", error);
    return NextResponse.json(
      { error: "データエクスポートに失敗しました" },
      { status: 500 }
    );
  }
}
