// app/api/admin/delete-match-message/route.ts
// 管理者用API - 特定のマッチメッセージを削除

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    // 管理者認証
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

    // リクエストボディから削除対象を取得
    const { matchPairId, message, userIds } = await req.json();

    // matchPairIdまたは(message + userIds)のどちらかが必要
    if (
      !matchPairId &&
      (!message || !userIds || !Array.isArray(userIds) || userIds.length !== 2)
    ) {
      return NextResponse.json(
        {
          error:
            "matchPairId or (message and userIds array with 2 elements) is required",
        },
        { status: 400 }
      );
    }

    // ✅ トランザクション内で全ての処理を実行
    const result = await prisma.$transaction(async (tx) => {
      // 1. 削除対象のMatchPairを取得
      let targetMatchPairs: Array<{
        id: string;
        user1Id: string;
        user2Id: string;
        message: string;
        matchedAt: Date;
      }> = [];

      if (matchPairId) {
        const matchPair = await tx.matchPair.findUnique({
          where: { id: matchPairId },
        });
        if (!matchPair) {
          throw new Error("MatchPair not found");
        }
        targetMatchPairs = [matchPair];
      } else {
        const [user1Id, user2Id] = userIds;
        const matchPairs = await tx.matchPair.findMany({
          where: {
            message,
            OR: [
              { user1Id, user2Id },
              { user1Id: user2Id, user2Id: user1Id },
            ],
          },
        });
        if (matchPairs.length === 0) {
          throw new Error("MatchPair not found");
        }
        targetMatchPairs = matchPairs;
      }

      // 2. 削除前にPresetMessageのカウント調整用データを収集
      const presetMessageData = new Map<
        string,
        {
          presetMessage: {
            id: string;
            count: number;
            senderCount: number;
          };
          deletedSentMessages: Array<{ senderId: string; id: string }>;
          deletedCount: number;
        }
      >();

      // 3. 各MatchPairに対応するSentMessageを特定（削除前に取得）
      const allSentMessageIds: string[] = [];
      const sentMessageMap = new Map<
        string,
        Array<{ senderId: string; id: string }>
      >();

      for (const matchPair of targetMatchPairs) {
        // ✅ マッチ時刻前後のSentMessageのみを対象にする（範囲を限定）
        const matchedAt = matchPair.matchedAt;
        const beforeMatch = new Date(matchedAt.getTime() - 5 * 60 * 1000); // 5分前
        const afterMatch = new Date(matchedAt.getTime() + 5 * 60 * 1000); // 5分後

        const sentMessages = await tx.sentMessage.findMany({
          where: {
            message: matchPair.message,
            createdAt: {
              gte: beforeMatch,
              lte: afterMatch,
            },
            OR: [
              {
                senderId: matchPair.user1Id,
                receiverId: matchPair.user2Id,
              },
              {
                senderId: matchPair.user2Id,
                receiverId: matchPair.user1Id,
              },
            ],
          },
        });

        for (const sm of sentMessages) {
          allSentMessageIds.push(sm.id);
          if (!sentMessageMap.has(sm.message)) {
            sentMessageMap.set(sm.message, []);
          }
          sentMessageMap
            .get(sm.message)!
            .push({ senderId: sm.senderId, id: sm.id });
        }

        // PresetMessageのデータを収集
        if (!presetMessageData.has(matchPair.message)) {
          const presetMessage = await tx.presetMessage.findFirst({
            where: { content: matchPair.message },
            select: { id: true, count: true, senderCount: true },
          });
          if (presetMessage) {
            presetMessageData.set(matchPair.message, {
              presetMessage,
              deletedSentMessages: [],
              deletedCount: 0,
            });
          }
        }
      }

      // 4. PresetMessageのカウント調整用データを準備（削除前の状態を確認）
      for (const [messageContent, presetData] of presetMessageData.entries()) {
        const sentMessages = sentMessageMap.get(messageContent) || [];
        presetData.deletedSentMessages = sentMessages;
        presetData.deletedCount = sentMessages.length;
      }

      // 5. MatchPairを削除
      const deletedMatchPairIds = targetMatchPairs.map((mp) => mp.id);
      await tx.matchPair.deleteMany({
        where: { id: { in: deletedMatchPairIds } },
      });

      // 6. SentMessageを削除
      let deletedSentMessageCount = 0;
      if (allSentMessageIds.length > 0) {
        const deleteResult = await tx.sentMessage.deleteMany({
          where: { id: { in: allSentMessageIds } },
        });
        deletedSentMessageCount = deleteResult.count;
      }

      // 7. PresetMessageのカウントを調整
      const presetMessageUpdates: Array<{
        message: string;
        count: number;
        senderCount: number;
      }> = [];

      for (const [messageContent, presetData] of presetMessageData.entries()) {
        const { presetMessage, deletedCount } = presetData;

        // ✅ 削除後に各ユーザーの送信記録を確認してsenderCountを計算
        const userIdsToCheck = new Set(
          presetData.deletedSentMessages.map((sm) => sm.senderId)
        );
        let senderCountDecrease = 0;

        for (const userId of userIdsToCheck) {
          // 削除後、このユーザーの同じメッセージの送信記録が残っているか確認
          const remainingCount = await tx.sentMessage.count({
            where: {
              senderId: userId,
              message: messageContent,
            },
          });
          // 残っている記録がない場合、senderCountを減らす
          if (remainingCount === 0) {
            senderCountDecrease++;
          }
        }

        const updatedCount = Math.max(0, presetMessage.count - deletedCount);
        const updatedSenderCount = Math.max(
          0,
          presetMessage.senderCount - senderCountDecrease
        );

        await tx.presetMessage.update({
          where: { id: presetMessage.id },
          data: {
            count: updatedCount,
            senderCount: updatedSenderCount,
          },
        });

        presetMessageUpdates.push({
          message: messageContent,
          count: updatedCount,
          senderCount: updatedSenderCount,
        });
      }

      return {
        deletedMatchPairs: targetMatchPairs.length,
        deletedSentMessages: deletedSentMessageCount,
        presetMessageUpdates: presetMessageUpdates.length,
        details: {
          deletedMatchPairs: targetMatchPairs.map((mp) => ({
            id: mp.id,
            message: mp.message,
            user1Id: mp.user1Id,
            user2Id: mp.user2Id,
            matchedAt: mp.matchedAt.toISOString(),
          })),
          presetMessageUpdates,
        },
      };
    });

    return NextResponse.json({
      success: true,
      deleted: {
        matchPairs: result.deletedMatchPairs,
        sentMessages: result.deletedSentMessages,
        presetMessageUpdates: result.presetMessageUpdates,
      },
      details: result.details,
    });
  } catch (error) {
    console.error("🚨 マッチメッセージ削除エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to delete match message",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
