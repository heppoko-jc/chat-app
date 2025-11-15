// app/api/cancel-message/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    const { messageId, messageIds, senderId } = await req.json();

    // messageIds（配列）またはmessageId（単一）のどちらかが必要
    const ids = messageIds || (messageId ? [messageId] : []);

    if (!ids.length || !senderId) {
      return NextResponse.json(
        { error: "messageId(s) and senderId are required" },
        { status: 400 }
      );
    }

    // メッセージが本人のものか確認
    const messages = await prisma.sentMessage.findMany({
      where: {
        id: { in: ids },
      },
    });

    // 全てのメッセージが本人のものか確認
    const unauthorizedMessages = messages.filter(
      (msg) => msg.senderId !== senderId
    );
    if (unauthorizedMessages.length > 0) {
      return NextResponse.json(
        { error: "Some messages not found or unauthorized" },
        { status: 403 }
      );
    }

    // 削除対象のメッセージ内容を取得（重複排除）
    const messageContents = [...new Set(messages.map((msg) => msg.message))];

    // メッセージを削除（先に削除してからPresetMessageを更新）
    await prisma.sentMessage.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    // 各メッセージ内容についてPresetMessageを更新
    for (const messageContent of messageContents) {
      const presetMessage = await prisma.presetMessage.findFirst({
        where: { content: messageContent },
      });

      if (presetMessage) {
        // ✅ 実際のSentMessageの数を動的に計算（非表示を除外）
        const actualCount = await prisma.sentMessage.count({
          where: {
            message: messageContent,
            isHidden: false,
          },
        });

        // ✅ 実際のユニーク送信者数を動的に計算（非表示を除外）
        const uniqueSenders = await prisma.sentMessage.findMany({
          where: {
            message: messageContent,
            isHidden: false,
          },
          select: { senderId: true },
          distinct: ["senderId"],
        });
        const actualSenderCount = uniqueSenders.length;

        // ✅ 最新の送信時刻を取得（非表示を除外）
        const latestSentMessage = await prisma.sentMessage.findFirst({
          where: {
            message: messageContent,
            isHidden: false,
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });

        // countが0になった場合はPresetMessageを削除
        if (actualCount === 0) {
          await prisma.presetMessage.delete({
            where: { id: presetMessage.id },
          });
          console.log(
            `[cancel-message] PresetMessage削除: ${messageContent} (count=0)`
          );
        } else {
          // PresetMessageを更新（countとsenderCountを実際の値に更新）
          await prisma.presetMessage.update({
            where: { id: presetMessage.id },
            data: {
              count: actualCount,
              senderCount: actualSenderCount,
              lastSentAt:
                latestSentMessage?.createdAt || presetMessage.lastSentAt,
            },
          });
          console.log(
            `[cancel-message] PresetMessage更新: ${messageContent}, count=${actualCount}, senderCount=${actualSenderCount}`
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🚨 メッセージ削除エラー:", error);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 }
    );
  }
}
