// app/api/cancel-message/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function DELETE(req: NextRequest) {
  try {
    const { messageId, senderId } = await req.json();

    if (!messageId || !senderId) {
      return NextResponse.json(
        { error: "messageId and senderId are required" },
        { status: 400 }
      );
    }

    // メッセージが本人のものか確認
    const message = await prisma.sentMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.senderId !== senderId) {
      return NextResponse.json(
        { error: "Message not found or unauthorized" },
        { status: 403 }
      );
    }

    // PresetMessageのカウントを減算
    const presetMessage = await prisma.presetMessage.findFirst({
      where: { content: message.message },
    });

    if (presetMessage) {
      // この送信者の同じメッセージの送信回数をチェック
      const sameUserSentMessages = await prisma.sentMessage.findMany({
        where: {
          senderId: senderId,
          message: message.message,
        },
      });

      // 削除対象を除いた残りの送信回数をチェック
      const remainingSentMessages = sameUserSentMessages.filter(
        (msg) => msg.id !== messageId
      );

      // この送信者の送信記録が全てなくなる場合のみsenderCountを減算
      const shouldDecreaseSenderCount = remainingSentMessages.length === 0;

      await prisma.presetMessage.update({
        where: { id: presetMessage.id },
        data: {
          count: Math.max(0, presetMessage.count - 1),
          // 送信記録が全てなくなる場合のみsenderCountを減算
          senderCount: shouldDecreaseSenderCount
            ? Math.max(0, presetMessage.senderCount - 1)
            : presetMessage.senderCount,
        },
      });
    }

    // メッセージを削除
    await prisma.sentMessage.delete({
      where: { id: messageId },
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
