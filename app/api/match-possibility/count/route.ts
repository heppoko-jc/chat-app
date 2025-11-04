// app/api/match-possibility/count/route.ts - マッチの可能性がある件数を取得するAPI

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchExpiryDate } from "@/lib/match-utils";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // 24時間前の日時を計算
    const expiryDate = getMatchExpiryDate();

    // 自分宛に送信された未マッチのメッセージを取得
    // ✅ 非表示メッセージも除外
    const unMatchedMessages = await prisma.sentMessage.findMany({
      where: {
        receiverId: userId,
        isHidden: false, // ← 追加
        // マッチしていないメッセージを取得するため、MatchPairに存在しないものを探す
        NOT: {
          // この条件は後で実装
        },
      },
      select: {
        id: true,
        message: true,
        createdAt: true,
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

    // 24時間以内のメッセージのみをカウント
    const recentUnMatchedMessages = trulyUnMatchedMessages.filter(
      (sm) => new Date(sm.createdAt) >= expiryDate
    );

    // マッチの可能性がある件数
    const matchPossibilityCount = recentUnMatchedMessages.length;

    console.log(`Match possibility count for user ${userId}:`, {
      totalUnMatched: unMatchedMessages.length,
      matchedMessages: matchedMessages.length,
      trulyUnMatched: trulyUnMatchedMessages.length,
      recentUnMatched: recentUnMatchedMessages.length,
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
