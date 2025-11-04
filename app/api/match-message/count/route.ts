// app/api/match-message/count/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchExpiryDate } from "@/lib/match-utils";

/**
 * GET /api/match-message/count
 * ヘッダー userId をもとに、
 * 自分が受信したメッセージのうち、まだマッチしていないものの件数を返す
 * （取り消されたメッセージは自動的に除外される）
 * （最終送信から24時間以上経過したメッセージも除外される）
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("userId");
  if (!userId) {
    return NextResponse.json({ count: 0 });
  }
  try {
    // 自分が受信したメッセージのうち、マッチしていないものをカウント
    // 取り消されたメッセージは既にDBから削除されているため、自動的に除外される
    // ✅ 非表示メッセージも除外
    const unmatchedMessages = await prisma.sentMessage.findMany({
      where: {
        receiverId: userId,
        isHidden: false, // ← 追加
      },
      select: {
        id: true,
        senderId: true,
        message: true,
        createdAt: true,
      },
    });

    // 24時間前の時刻
    const expiryDate = getMatchExpiryDate();

    let unmatchedCount = 0;

    for (const receivedMessage of unmatchedMessages) {
      // このメッセージについて、マッチが成立しているかチェック
      const matchExists = await prisma.matchPair.findFirst({
        where: {
          message: receivedMessage.message,
          OR: [
            { user1Id: receivedMessage.senderId, user2Id: userId },
            { user1Id: userId, user2Id: receivedMessage.senderId },
          ],
        },
      });

      // マッチが存在しない場合のみカウント対象とする
      if (!matchExists) {
        // さらに、このメッセージがPresetMessageに存在し、期限切れでないかチェック
        const presetMessage = await prisma.presetMessage.findFirst({
          where: {
            content: receivedMessage.message,
          },
          select: {
            lastSentAt: true,
          },
        });

        // PresetMessageに存在し、かつ最終送信が24時間以内の場合のみカウント
        if (presetMessage && presetMessage.lastSentAt >= expiryDate) {
          unmatchedCount++;
        }
      }
    }

    return NextResponse.json({ count: unmatchedCount });
  } catch (error) {
    console.error("Error counting unmatched messages:", error);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}
