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
  { params }: { params: Promise<{ friendId: string }> }
) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { friendId } = await params;

    // 1. フォロー解除
    await prisma.friend.deleteMany({
      where: { userId, friendId },
    });

    // 2. ショートカットから該当ユーザーを削除
    const shortcuts = await prisma.shortcut.findMany({
      where: { userId },
      include: {
        members: {
          where: { memberId: friendId },
        },
      },
    });

    // トランザクションで処理
    const deleteOperations = shortcuts
      .filter((shortcut) => shortcut.members.length > 0)
      .map((shortcut) =>
        prisma.shortcutMember.deleteMany({
          where: {
            shortcutId: shortcut.id,
            memberId: friendId,
          },
        })
      );

    if (deleteOperations.length > 0) {
      await prisma.$transaction(deleteOperations);
    }

    // 3. メンバーが0人になったショートカットを削除
    const emptyShortcuts = await prisma.shortcut.findMany({
      where: { userId },
      include: {
        members: true,
      },
    });

    const shortcutsToDelete = emptyShortcuts.filter(
      (s) => s.members.length === 0
    );

    if (shortcutsToDelete.length > 0) {
      await prisma.shortcut.deleteMany({
        where: {
          id: { in: shortcutsToDelete.map((s) => s.id) },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ともだち解除エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
