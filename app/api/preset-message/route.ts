// app/api/preset-message/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getMatchExpiryDate } from "@/lib/match-utils";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId"); // 現在のユーザーIDを取得
    const expiryDate = getMatchExpiryDate();

    // 現在のユーザーのともだち一覧を取得
    let friendIds: string[] = [];
    if (userId) {
      const friends = await prisma.friend.findMany({
        where: { userId },
        select: { friendId: true },
      });
      friendIds = friends.map((f) => f.friendId);
    }

    // ともだちが24時間以内に送信したメッセージの内容を取得
    const sentByFriends = await prisma.sentMessage.findMany({
      where: {
        senderId: { in: friendIds },
        createdAt: { gte: expiryDate },
      },
      select: {
        message: true,
      },
      distinct: ["message"],
    });
    const friendSentMessages = sentByFriends.map((s) => s.message);

    const messages = await prisma.presetMessage.findMany({
      where: {
        count: { gt: 0 },
        lastSentAt: { gte: expiryDate }, // 24時間以内のメッセージのみ取得
        // 自分が作成したメッセージ または ともだちが送信したメッセージ
        OR: [
          { createdBy: userId },
          ...(friendSentMessages.length > 0
            ? [{ content: { in: friendSentMessages } }]
            : []),
        ],
      },
      orderBy: { lastSentAt: "desc" },
      select: {
        id: true,
        content: true,
        createdBy: true,
        createdAt: true,
        count: true,
        senderCount: true,
        linkTitle: true,
        linkImage: true,
        lastSentAt: true,
      },
    });
    return NextResponse.json(messages);
  } catch (err) {
    console.error("GET /api/preset-message failed:", err);
    console.error("Error details:", {
      message: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined,
    });
    return NextResponse.json(
      {
        error: "取得に失敗しました",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { content, createdBy, linkTitle, linkImage } = await req.json();
    console.log("[preset-message] POST リクエスト:", {
      content,
      createdBy,
      linkTitle,
      linkImage,
    });

    if (!content || !createdBy) {
      return NextResponse.json(
        { error: "内容と作成者IDは必須です" },
        { status: 400 }
      );
    }

    const existingMessage = await prisma.presetMessage.findFirst({
      where: { content },
    });

    if (existingMessage) {
      // 実際のユニーク送信者数を動的に計算（より確実な方法）
      const uniqueSenders = await prisma.sentMessage.findMany({
        where: { message: content },
        select: { senderId: true },
        distinct: ["senderId"],
      });
      const actualSenderCount = uniqueSenders.length;

      console.log(`[preset-message] 送信者判定:`, {
        createdBy,
        content,
        actualSenderCount,
        currentSenderCount: existingMessage.senderCount,
        uniqueSenders: uniqueSenders.map((s) => s.senderId),
      });

      const updateData = {
        count: existingMessage.count + 1,
        // 実際のユニーク送信者数を使用
        senderCount: actualSenderCount,
        lastSentAt: new Date(),
        // リンクメタデータが提供された場合は更新
        ...(linkTitle && { linkTitle }),
        ...(linkImage && { linkImage }),
      };
      console.log("[preset-message] 既存メッセージ更新:", updateData);

      const updatedMessage = await prisma.presetMessage.update({
        where: { id: existingMessage.id },
        data: updateData,
      });
      return NextResponse.json(updatedMessage);
    }

    const createData = {
      content,
      createdBy,
      count: 1,
      senderCount: 1, // 新規作成時は送信者数も1
      linkTitle: linkTitle || null,
      linkImage: linkImage || null,
    };
    console.log("[preset-message] 新規メッセージ作成:", createData);

    const newMessage = await prisma.presetMessage.create({
      data: createData,
    });
    return NextResponse.json(newMessage, { status: 201 });
  } catch (err) {
    console.error("POST /api/preset-message failed:", err);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.presetMessage.deleteMany({});
    return NextResponse.json({ message: "All preset messages deleted" });
  } catch (err) {
    console.error("DELETE /api/preset-message failed:", err);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }
}
