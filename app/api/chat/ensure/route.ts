// app/api/chat/ensure/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    console.log("POST /api/chat/ensure called");
    const userId = req.headers.get("userId"); // 既存APIと同じくヘッダで受け取る
    console.log("userId from header:", userId);
    if (!userId) {
      console.log("No userId provided");
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    const { partnerId } = await req.json();
    console.log("partnerId from body:", partnerId);
    if (!partnerId) {
      console.log("No partnerId provided");
      return NextResponse.json(
        { error: "partnerId is required" },
        { status: 400 }
      );
    }

    // 昇順に正規化（重複部屋防止）
    const [u1, u2] =
      userId < partnerId ? [userId, partnerId] : [partnerId, userId];

    // 既存部屋を探す（両順序でヒット）
    let chat = await prisma.chat.findFirst({
      where: {
        OR: [
          { user1Id: u1, user2Id: u2 },
          { user1Id: u2, user2Id: u1 },
        ],
      },
      select: { id: true },
    });

    // なければ作成（正規化した順で保存）
    if (!chat) {
      chat = await prisma.chat.create({
        data: { user1Id: u1, user2Id: u2 },
        select: { id: true },
      });
    }

    return NextResponse.json({ chatId: chat.id });
  } catch (e) {
    console.error("🚨 ensure chat error:", e);
    return NextResponse.json(
      { error: "failed to ensure chat" },
      { status: 500 }
    );
  }
}
