// app/api/friends/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/friends
 * ともだち一覧を取得
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const friends = await prisma.friend.findMany({
      where: { userId },
      select: { id: true, friendId: true },
    });

    return NextResponse.json(friends);
  } catch (error) {
    console.error("ともだち一覧取得エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/friends
 * ともだちを追加
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { friendId } = await req.json();
    if (!friendId) {
      return NextResponse.json({ error: "friendId required" }, { status: 400 });
    }

    // 自分自身をともだちに追加することを防ぐ
    if (userId === friendId) {
      return NextResponse.json(
        { error: "Cannot add yourself as friend" },
        { status: 400 }
      );
    }

    const friend = await prisma.friend.create({
      data: { userId, friendId },
    });

    return NextResponse.json(friend);
  } catch (error) {
    console.error("ともだち追加エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
