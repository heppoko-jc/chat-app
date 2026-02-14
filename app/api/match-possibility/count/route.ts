// app/api/match-possibility/count/route.ts - マッチの可能性がある件数を取得するAPI

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const now = new Date();

    // 自分宛に送信されたメッセージのうち、有効期限内（expiresAt >= now）・非表示除外
    const unMatchedMessages = await prisma.sentMessage.findMany({
      where: {
        receiverId: userId,
        isHidden: false,
        expiresAt: { gte: now },
      },
      select: {
        id: true,
        message: true,
        senderId: true,
      },
    });

    // マッチ済みのメッセージを取得
    const matchedMessages = await prisma.matchPair.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      select: {
        message: true,
        user1Id: true,
        user2Id: true,
      },
    });

    // マッチ済みのメッセージのセットを作成
    const matchedMessageSet = new Set(
      matchedMessages.map((mp) => `${mp.message}-${mp.user1Id}-${mp.user2Id}`)
    );

    // 未マッチのメッセージをフィルタリング
    const trulyUnMatchedMessages = unMatchedMessages.filter((sm) => {
      // 送信者と受信者の組み合わせでマッチ済みかチェック
      const messageKey1 = `${sm.message}-${sm.senderId}-${userId}`;
      const messageKey2 = `${sm.message}-${userId}-${sm.senderId}`;

      return (
        !matchedMessageSet.has(messageKey1) &&
        !matchedMessageSet.has(messageKey2)
      );
    });

    // マッチの可能性がある件数（有効期限内は既にクエリで絞り込み済み）
    const matchPossibilityCount = trulyUnMatchedMessages.length;

    console.log(`Match possibility count for user ${userId}:`, {
      totalUnMatched: unMatchedMessages.length,
      matchedMessages: matchedMessages.length,
      trulyUnMatched: trulyUnMatchedMessages.length,
      matchPossibilityCount,
    });

    return NextResponse.json({ count: matchPossibilityCount });
  } catch (error) {
    console.error("Match possibility count error:", error);
    return NextResponse.json(
      { error: "マッチの可能性件数の取得に失敗しました" },
      { status: 500 }
    );
  }
}
