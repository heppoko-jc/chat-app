// app/api/notifications/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchExpiryDate } from "@/lib/match-utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    // ✅ 自分が送信したマッチメッセージ履歴（非表示を除外）
    const sentMessages = await prisma.sentMessage.findMany({
      where: {
        senderId: userId,
        isHidden: false, // ← 追加
      },
      include: {
        receiver: { select: { id: true, name: true } },
        shortcut: { select: { id: true, name: true } }, // ショートカット情報を取得
      },
      orderBy: { createdAt: "desc" },
    });

    // ✅ 自分のマッチング履歴
    const matchedPairs = await prisma.matchPair.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
      },
      orderBy: { matchedAt: "desc" },
    });

    // PresetMessageのlastSentAtを取得（期限切れ判定用）
    const presetMessages = await prisma.presetMessage.findMany({
      select: {
        content: true,
        lastSentAt: true,
      },
    });

    const presetMessageMap = new Map(
      presetMessages.map((pm) => [pm.content, pm.lastSentAt])
    );

    const expiryDate = getMatchExpiryDate();

    // ✅ 送信済みメッセージとマッチ済みメッセージの照合
    const updatedSentMessages = sentMessages.map((msg) => ({
      ...msg,
      isMatched: matchedPairs.some(
        (match) =>
          match.message === msg.message &&
          (match.user1.id === msg.receiver.id ||
            match.user2.id === msg.receiver.id)
      ),
      // 期限切れ判定：PresetMessageのlastSentAtが24時間以上前
      isExpired:
        presetMessageMap.has(msg.message) &&
        presetMessageMap.get(msg.message)! < expiryDate,
      // ショートカット情報を追加
      shortcutName: msg.shortcut?.name || null,
      shortcutId: msg.shortcutId || null,
    }));

    return NextResponse.json({
      sentMessages: updatedSentMessages,
      matchedPairs,
    });
  } catch (error) {
    console.error("🚨 通知データ取得エラー:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
