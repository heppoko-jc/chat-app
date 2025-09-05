// app/api/cancel-message/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function DELETE(req: NextRequest) {
  try {
    const { messageId, senderId } = await req.json();

    if (!messageId || !senderId) {
      return NextResponse.json({ error: "messageId and senderId are required" }, { status: 400 });
    }

    // メッセージが本人のものか確認
    const message = await prisma.sentMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.senderId !== senderId) {
      return NextResponse.json({ error: "Message not found or unauthorized" }, { status: 403 });
    }

    // メッセージを削除
    await prisma.sentMessage.delete({
      where: { id: messageId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🚨 メッセージ削除エラー:", error);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}