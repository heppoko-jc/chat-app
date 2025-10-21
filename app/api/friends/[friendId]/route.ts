// app/api/friends/[friendId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * DELETE /api/friends/[friendId]
 * ともだちを解除
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { friendId: string } }
) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    await prisma.friend.deleteMany({
      where: { userId, friendId: params.friendId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ともだち解除エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
