// app/api/admin/delete-unmatched-message/route.ts
// 管理者用API - 未マッチメッセージを削除

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
    const { messageId, messageIds } = await req.json();

    // messageIds（配列）またはmessageId（単一）のどちらかが必要
    const ids = messageIds || (messageId ? [messageId] : []);

    if (!ids.length) {
      return NextResponse.json(
        { error: "messageId or messageIds is required" },
        { status: 400 }
      );
    }

    // ✅ トランザクション内で全ての処理を実行
    const result = await prisma.$transaction(async (tx) => {
      // 1. 削除対象のメッセージを取得
      const messages = await tx.sentMessage.findMany({
        where: {
          id: { in: ids },
        },
      });

      if (messages.length === 0) {
        throw new Error("Messages not found");
      }

      // 2. 未マッチメッセージであることを確認（MatchPairが存在しないことを確認）
      const allMatches = await tx.matchPair.findMany({
        select: {
          user1Id: true,
          user2Id: true,
          message: true,
        },
      });

      const matchedSet = new Set<string>();
      allMatches.forEach((match) => {
        matchedSet.add(`${match.message}-${match.user1Id}-${match.user2Id}`);
        matchedSet.add(`${match.message}-${match.user2Id}-${match.user1Id}`);
      });

      const unmatchedMessages = messages.filter((msg) => {
        const key = `${msg.message}-${msg.senderId}-${msg.receiverId}`;
        return !matchedSet.has(key);
      });

      if (unmatchedMessages.length === 0) {
        throw new Error(
          "All specified messages are already matched. Use delete-match-message API instead."
        );
      }

      // 3. 削除前にPresetMessageのカウント調整用データを収集
      const messageContentMap = new Map<string, number>();
      for (const message of unmatchedMessages) {
        const count = messageContentMap.get(message.message) || 0;
        messageContentMap.set(message.message, count + 1);
      }

      // 4. 各メッセージ内容についてPresetMessageを更新
      const presetMessageUpdates: Array<{
        message: string;
        count: number;
        senderCount: number;
      }> = [];

      for (const [messageContent, deleteCount] of messageContentMap.entries()) {
        const presetMessage = await tx.presetMessage.findFirst({
          where: { content: messageContent },
        });

        if (presetMessage) {
          // 削除対象のメッセージの送信者IDを取得
          const senderIds = new Set(
            unmatchedMessages
              .filter((msg) => msg.message === messageContent)
              .map((msg) => msg.senderId)
          );

          // 各送信者について、削除後に残る送信記録があるかチェック
          let senderCountDecrease = 0;
          for (const senderId of senderIds) {
            // 削除対象を除いた残りの送信回数をチェック
            const remainingSentMessages = await tx.sentMessage.findMany({
              where: {
                senderId: senderId,
                message: messageContent,
                id: { notIn: ids }, // 削除対象を除く
              },
            });

            // この送信者の送信記録が全てなくなる場合のみsenderCountを減算
            if (remainingSentMessages.length === 0) {
              senderCountDecrease++;
            }
          }

          const updatedCount = Math.max(0, presetMessage.count - deleteCount);
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
      }

      // 5. メッセージを削除
      const deleteResult = await tx.sentMessage.deleteMany({
        where: {
          id: { in: ids },
        },
      });

      return {
        deletedCount: deleteResult.count,
        unmatchedMessages: unmatchedMessages.length,
        presetMessageUpdates: presetMessageUpdates.length,
        details: {
          deletedMessageIds: unmatchedMessages.map((msg) => msg.id),
          presetMessageUpdates,
        },
      };
    });

    return NextResponse.json({
      success: true,
      deleted: {
        sentMessages: result.deletedCount,
        unmatchedMessages: result.unmatchedMessages,
        presetMessageUpdates: result.presetMessageUpdates,
      },
      details: result.details,
    });
  } catch (error) {
    console.error("🚨 未マッチメッセージ削除エラー:", error);
    return NextResponse.json(
      {
        error: "Failed to delete unmatched message",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
