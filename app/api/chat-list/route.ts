// app/api/chat-list/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }
    const me = userId as string;

    // 非表示にするユーザーIDを取得
    const hiddenUserIds = process.env.HIDDEN_USER_IDS?.split(",") || [];

    // 自分とマッチしたことのあるユーザーIDを取得
    const matchedUserIds = await prisma.matchPair.findMany({
      where: {
        OR: [{ user1Id: me }, { user2Id: me }],
      },
      select: {
        user1Id: true,
        user2Id: true,
      },
    });

    // マッチしたユーザーIDのセットを作成
    const matchedIds = new Set<string>();
    matchedUserIds.forEach((pair) => {
      if (pair.user1Id !== me) matchedIds.add(pair.user1Id);
      if (pair.user2Id !== me) matchedIds.add(pair.user2Id);
    });

    // マッチしたユーザーのみを取得（非表示ユーザーを除外）
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: Array.from(matchedIds),
          notIn: hiddenUserIds, // 非表示ユーザーを除外
        },
      },
      select: { id: true, name: true },
    });

    // 自分が属するチャットを全部取得（非表示ユーザーとのチャットも除外）
    const chats = await prisma.chat.findMany({
      where: {
        AND: [
          {
            OR: [{ user1Id: me }, { user2Id: me }],
          },
          {
            NOT: {
              OR: [
                { user1Id: { in: hiddenUserIds } },
                { user2Id: { in: hiddenUserIds } },
              ],
            },
          },
        ],
      },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: "desc" }, // 最新が先頭
        },
      },
    });

    // ユーザーごとにチャット情報を組み立て
    const chatList = await Promise.all(
      users.map(async (u) => {
        // 「自分とこのユーザー」のチャットを探す
        const chat = chats.find(
          (c) =>
            (c.user1Id === me && c.user2Id === u.id) ||
            (c.user2Id === me && c.user1Id === u.id)
        );

        if (chat) {
          const matchedUser = chat.user1Id === me ? chat.user2 : chat.user1;

          const hasMsg = chat.messages.length > 0;
          const latest = hasMsg ? chat.messages[0] : null;
          const latestMessage = hasMsg ? latest!.content : "メッセージなし";
          const latestMessageAtDate = hasMsg
            ? latest!.createdAt
            : chat.createdAt;
          const latestMessageAt = latestMessageAtDate.toISOString();
          const latestMessageSenderId = hasMsg ? latest!.senderId : null;

          // 2人の組合せで MatchPair をすべて取得（古い→新しい）
          const matchHistory = await prisma.matchPair.findMany({
            where: {
              OR: [
                { user1Id: chat.user1Id, user2Id: chat.user2Id },
                { user1Id: chat.user2Id, user2Id: chat.user1Id },
              ],
            },
            orderBy: { matchedAt: "asc" },
            select: { message: true, matchedAt: true },
          });

          const latestMatch = matchHistory.length
            ? matchHistory[matchHistory.length - 1]
            : null;

          return {
            chatId: chat.id,
            matchedUser: { id: matchedUser.id, name: matchedUser.name },
            matchMessage: latestMatch?.message ?? "（マッチメッセージなし）",
            matchMessageMatchedAt: latestMatch
              ? latestMatch.matchedAt.toISOString()
              : null,
            matchHistory: matchHistory.map((m) => ({
              message: m.message,
              matchedAt: m.matchedAt.toISOString(),
            })),
            latestMessage,
            latestMessageAt, // ISO 文字列
            latestMessageSenderId,
            messages: chat.messages
              .slice() // 念のためコピー（descのまま。未読数計算には順序不問）
              .map((m) => ({
                id: m.id,
                senderId: m.senderId,
                content: m.content,
                createdAt: m.createdAt.toISOString(),
              })),
          };
        }

        // チャット未作成のダミー
        return {
          chatId: `dummy-${u.id}`,
          matchedUser: { id: u.id, name: u.name },
          matchMessage: "（マッチメッセージなし）",
          matchMessageMatchedAt: null,
          matchHistory: [],
          latestMessage: "メッセージなし",
          latestMessageAt: null,
          latestMessageSenderId: null,
          messages: [] as Array<{
            id: string;
            senderId: string;
            content: string;
            createdAt: string;
          }>,
        };
      })
    );

    // 最新メッセージ日時で降順（null は下へ）
    chatList.sort((a, b) => {
      if (!a.latestMessageAt) return 1;
      if (!b.latestMessageAt) return -1;
      return (
        new Date(b.latestMessageAt).getTime() -
        new Date(a.latestMessageAt).getTime()
      );
    });

    return NextResponse.json(chatList);
  } catch (error) {
    console.error("🚨 チャットリスト取得エラー:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat list" },
      { status: 500 }
    );
  }
}
