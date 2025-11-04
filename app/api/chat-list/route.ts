// app/api/chat-list/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        AND: [
          {
            id: {
              in: Array.from(matchedIds),
              notIn: hiddenUserIds, // 非表示ユーザーを除外
            },
          },
          {
            email: {
              notIn: ["yoko.kiyama@icloud.com", "miharu.kiyama@icloud.com"], // メールアドレスでも除外
            },
          },
        ],
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

          // ✅ 非表示マッチを除外して、表示可能なマッチのみを取得
          // パフォーマンス最適化：一括でSentMessageを取得
          const matchMessages = matchHistory.map((m) => m.message);
          const relevantSentMessages = await prisma.sentMessage.findMany({
            where: {
              message: { in: matchMessages },
              OR: [
                { senderId: chat.user1Id, receiverId: chat.user2Id },
                { senderId: chat.user2Id, receiverId: chat.user1Id },
              ],
            },
            select: {
              message: true,
              senderId: true,
              receiverId: true,
              isHidden: true,
            },
          });

          // メッセージごとにグループ化
          const messageMap = new Map<
            string,
            Array<{ senderId: string; receiverId: string; isHidden: boolean }>
          >();
          for (const sm of relevantSentMessages) {
            if (!messageMap.has(sm.message)) {
              messageMap.set(sm.message, []);
            }
            messageMap.get(sm.message)!.push({
              senderId: sm.senderId,
              receiverId: sm.receiverId,
              isHidden: sm.isHidden,
            });
          }

          // 非表示でないマッチのみをフィルタ
          const visibleMatches = matchHistory.filter((match) => {
            const sentMessages = messageMap.get(match.message) || [];
            // 両方向のSentMessageが存在し、どちらも非表示でないことを確認
            const hasUser1ToUser2 = sentMessages.some(
              (sm) =>
                sm.senderId === chat.user1Id &&
                sm.receiverId === chat.user2Id &&
                !sm.isHidden
            );
            const hasUser2ToUser1 = sentMessages.some(
              (sm) =>
                sm.senderId === chat.user2Id &&
                sm.receiverId === chat.user1Id &&
                !sm.isHidden
            );
            return hasUser1ToUser2 && hasUser2ToUser1;
          });

          // ✅ 最新の表示可能なマッチを取得（直前のマッチメッセージ）
          const latestMatch =
            visibleMatches.length > 0
              ? visibleMatches[visibleMatches.length - 1]
              : null;

          return {
            chatId: chat.id,
            matchedUser: { id: matchedUser.id, name: matchedUser.name },
            matchMessage: latestMatch?.message ?? "（マッチメッセージなし）",
            matchMessageMatchedAt: latestMatch
              ? latestMatch.matchedAt.toISOString()
              : null,
            matchHistory: visibleMatches.map((m) => ({
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
