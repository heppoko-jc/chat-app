// app/api/shortcuts/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/shortcuts/[id]
 * ショートカットを更新（名称変更・メンバー編集）
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { id } = await params;
    const { name, memberIds } = await req.json();

    // ショートカットの所有者を確認
    const shortcut = await prisma.shortcut.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!shortcut) {
      return NextResponse.json(
        { error: "Shortcut not found" },
        { status: 404 }
      );
    }

    if (shortcut.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // フォロー状態をチェック
    const friends = await prisma.friend.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = new Set(friends.map((f) => f.friendId));

    // メンバーが指定されている場合は更新
    if (memberIds && Array.isArray(memberIds)) {
      if (memberIds.length === 0) {
        return NextResponse.json(
          { error: "memberIds must not be empty" },
          { status: 400 }
        );
      }

      // フォローしていないユーザーが含まれていないかチェック
      const invalidMemberIds = memberIds.filter((id) => !friendIds.has(id));
      if (invalidMemberIds.length > 0) {
        return NextResponse.json(
          { error: "Some memberIds are not in your friend list" },
          { status: 400 }
        );
      }

      // 既存のメンバーを削除
      await prisma.shortcutMember.deleteMany({
        where: { shortcutId: id },
      });

      // 新しいメンバーを追加
      await prisma.shortcutMember.createMany({
        data: memberIds.map((memberId, index) => ({
          shortcutId: id,
          memberId,
          order: index,
        })),
      });
    }

    // 名称が指定されている場合は更新
    const updateData: { name?: string | null } = {};
    if (name !== undefined) {
      updateData.name = name || null;
    }

    // ショートカットを更新
    const updatedShortcut = await prisma.shortcut.update({
      where: { id },
      data: updateData,
      include: {
        members: {
          orderBy: { order: "asc" },
        },
      },
    });

    // メンバー情報を取得
    const memberUsers = await prisma.user.findMany({
      where: {
        id: { in: updatedShortcut.members.map((m) => m.memberId) },
      },
      select: {
        id: true,
        name: true,
        bio: true,
      },
    });

    return NextResponse.json({
      id: updatedShortcut.id,
      userId: updatedShortcut.userId,
      name: updatedShortcut.name,
      createdAt: updatedShortcut.createdAt,
      updatedAt: updatedShortcut.updatedAt,
      members: updatedShortcut.members.map((m) => {
        const user = memberUsers.find((u) => u.id === m.memberId);
        return {
          id: m.id,
          memberId: m.memberId,
          memberName: user?.name || "",
          memberBio: user?.bio || null,
          order: m.order,
        };
      }),
      memberCount: updatedShortcut.members.length,
    });
  } catch (error) {
    console.error("ショートカット更新エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/shortcuts/[id]
 * ショートカットを削除
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { id } = await params;

    // ショートカットの所有者を確認
    const shortcut = await prisma.shortcut.findUnique({
      where: { id },
    });

    if (!shortcut) {
      return NextResponse.json(
        { error: "Shortcut not found" },
        { status: 404 }
      );
    }

    if (shortcut.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ショートカットを削除（CASCADEでメンバーも自動削除）
    await prisma.shortcut.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ショートカット削除エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
