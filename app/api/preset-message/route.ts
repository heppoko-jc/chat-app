// app/api/preset-message/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const messages = await prisma.presetMessage.findMany({
      where: {
        count: { gt: 0 },
        lastSentAt: { gte: threeDaysAgo }, // 72時間以内のメッセージのみ取得
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
      // この送信者が過去にこのメッセージを送信した記録があるかチェック
      const pastSentMessage = await prisma.sentMessage.findFirst({
        where: {
          senderId: createdBy,
          message: content,
        },
      });

      const updateData = {
        count: existingMessage.count + 1,
        // 過去に送信記録がない場合のみsenderCountを増加
        senderCount: pastSentMessage
          ? existingMessage.senderCount
          : existingMessage.senderCount + 1,
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
