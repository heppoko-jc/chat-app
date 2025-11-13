// app/api/shortcuts/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/shortcuts
 * ショートカット一覧を取得（フォロー状態をチェックしてフィルタリング）
 */
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // 1. ユーザーのフォローリストを取得
    const friends = await prisma.friend.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = new Set(friends.map((f) => f.friendId));

    // 2. ショートカットを取得
    const shortcuts = await prisma.shortcut.findMany({
      where: { userId },
      include: {
        members: {
          orderBy: { order: "asc" }, // 追加順でソート
        },
      },
      orderBy: { createdAt: "desc" }, // 作成日時の降順
    });

    // 3. フォロー解除されたユーザーを除外し、ショートカットを更新
    const filteredShortcuts = await Promise.all(
      shortcuts.map(async (shortcut) => {
        // フォロー中のメンバーのみをフィルタ
        const validMembers = shortcut.members.filter((m) =>
          friendIds.has(m.memberId)
        );

        // メンバーが0人になった場合はショートカットを削除
        if (validMembers.length === 0) {
          await prisma.shortcut.delete({
            where: { id: shortcut.id },
          });
          return null;
        }

        // フォロー解除されたメンバーをDBから削除
        const invalidMemberIds = shortcut.members
          .filter((m) => !friendIds.has(m.memberId))
          .map((m) => m.memberId);

        if (invalidMemberIds.length > 0) {
          await prisma.shortcutMember.deleteMany({
            where: {
              shortcutId: shortcut.id,
              memberId: { in: invalidMemberIds },
            },
          });
        }

        // メンバー情報を返す（ユーザー情報も含める）
        const memberUsers = await prisma.user.findMany({
          where: {
            id: { in: validMembers.map((m) => m.memberId) },
          },
          select: {
            id: true,
            name: true,
            bio: true,
          },
        });

        return {
          id: shortcut.id,
          userId: shortcut.userId,
          name: shortcut.name,
          createdAt: shortcut.createdAt,
          updatedAt: shortcut.updatedAt,
          members: validMembers.map((m) => {
            const user = memberUsers.find((u) => u.id === m.memberId);
            return {
              id: m.id,
              memberId: m.memberId,
              memberName: user?.name || "",
              memberBio: user?.bio || null,
              order: m.order,
            };
          }),
          memberCount: validMembers.length,
        };
      })
    );

    // nullを除外
    const result = filteredShortcuts.filter((s) => s !== null);

    return NextResponse.json(result);
  } catch (error) {
    console.error("ショートカット取得エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/shortcuts
 * ショートカットを作成
 */
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { name, memberIds } = await req.json();
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: "memberIds required and must be non-empty array" },
        { status: 400 }
      );
    }

    // フォロー状態をチェック
    const friends = await prisma.friend.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = new Set(friends.map((f) => f.friendId));

    // フォローしていないユーザーが含まれていないかチェック
    const invalidMemberIds = memberIds.filter((id) => !friendIds.has(id));
    if (invalidMemberIds.length > 0) {
      return NextResponse.json(
        { error: "Some memberIds are not in your friend list" },
        { status: 400 }
      );
    }

    // ショートカットを作成
    const shortcut = await prisma.shortcut.create({
      data: {
        userId,
        name: name || null, // 名前が未入力の場合はnull
        members: {
          create: memberIds.map((memberId, index) => ({
            memberId,
            order: index, // 追加順序
          })),
        },
      },
      include: {
        members: {
          orderBy: { order: "asc" },
        },
      },
    });

    // メンバー情報を取得
    const memberUsers = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
      },
      select: {
        id: true,
        name: true,
        bio: true,
      },
    });

    return NextResponse.json({
      id: shortcut.id,
      userId: shortcut.userId,
      name: shortcut.name,
      createdAt: shortcut.createdAt,
      updatedAt: shortcut.updatedAt,
      members: shortcut.members.map((m) => {
        const user = memberUsers.find((u) => u.id === m.memberId);
        return {
          id: m.id,
          memberId: m.memberId,
          memberName: user?.name || "",
          memberBio: user?.bio || null,
          order: m.order,
        };
      }),
      memberCount: shortcut.members.length,
    });
  } catch (error) {
    console.error("ショートカット作成エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
