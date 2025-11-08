// app/api/friends/popularity/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/friends/popularity
 * 自分がフォローしているユーザーたちの「人気ユーザー」を集計して返却
 * Header: userId
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const myFriends = await prisma.friend.findMany({
      where: { userId },
      select: { friendId: true },
    });

    const friendIds = myFriends.map((f) => f.friendId);
    if (friendIds.length === 0) {
      return NextResponse.json([]);
    }

    const popularUsers = await prisma.friend.groupBy({
      by: ["friendId"],
      where: {
        userId: { in: friendIds },
        friendId: { notIn: [...friendIds, userId] },
      },
      _count: { _all: true },
    });

    return NextResponse.json(
      popularUsers.map((item) => ({
        userId: item.friendId,
        count: item._count._all,
      }))
    );
  } catch (error) {
    console.error("人気ユーザー集計エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
