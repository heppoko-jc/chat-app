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

    // メッセージごとにPresetMessageのカウントを減算
    const messageContentMap = new Map<string, number>();
    for (const message of messages) {
      const count = messageContentMap.get(message.message) || 0;
      messageContentMap.set(message.message, count + 1);
    }

    // 各メッセージ内容についてPresetMessageを更新
    for (const [messageContent, deleteCount] of messageContentMap.entries()) {
      const presetMessage = await prisma.presetMessage.findFirst({
        where: { content: messageContent },
      });

      if (presetMessage) {
        // この送信者の同じメッセージの送信回数をチェック
        const sameUserSentMessages = await prisma.sentMessage.findMany({
          where: {
            senderId: senderId,
            message: messageContent,
          },
        });

        // 削除対象を除いた残りの送信回数をチェック
        const remainingSentMessages = sameUserSentMessages.filter(
          (msg) => !ids.includes(msg.id)
        );

        // この送信者の送信記録が全てなくなる場合のみsenderCountを減算
        const shouldDecreaseSenderCount = remainingSentMessages.length === 0;

        await prisma.presetMessage.update({
          where: { id: presetMessage.id },
          data: {
            count: Math.max(0, presetMessage.count - deleteCount),
            // 送信記録が全てなくなる場合のみsenderCountを減算
            senderCount: shouldDecreaseSenderCount
              ? Math.max(0, presetMessage.senderCount - 1)
              : presetMessage.senderCount,
          },
        });
      }
    }

    // メッセージを削除
    await prisma.sentMessage.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🚨 メッセージ削除エラー:", error);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 }
    );
  }
}
