// app/api/preset-message/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchExpiryDate } from "@/lib/match-utils";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId"); // 現在のユーザーIDを取得
    const expiryDate = getMatchExpiryDate();

    // 現在のユーザーのともだち一覧を取得
    let friendIds: string[] = [];
    if (userId) {
      const friends = await prisma.friend.findMany({
        where: { userId },
        select: { friendId: true },
      });
      friendIds = friends.map((f) => f.friendId);
    }

    // ともだちが24時間以内に送信したメッセージの内容を取得（非表示を除外）
    const sentByFriends = await prisma.sentMessage.findMany({
      where: {
        senderId: { in: friendIds },
        createdAt: { gte: expiryDate },
        isHidden: false, // ← 追加
      },
      select: {
        message: true,
      },
      distinct: ["message"],
    });
    const friendSentMessages = sentByFriends.map((s) => s.message);

    // 自分が24時間以内に送信したメッセージの内容を取得（非表示を除外）
    let mySentMessages: string[] = [];
    if (userId) {
      const sentByMe = await prisma.sentMessage.findMany({
        where: {
          senderId: userId,
          createdAt: { gte: expiryDate },
          isHidden: false, // 非表示を除外
        },
        select: {
          message: true,
        },
        distinct: ["message"],
      });
      mySentMessages = sentByMe.map((s) => s.message);
    }

    // 表示対象のメッセージ内容を結合（ともだちが送信したメッセージ + 自分が送信したメッセージ）
    const visibleMessages = [
      ...new Set([...friendSentMessages, ...mySentMessages]),
    ];

    // 表示対象のメッセージがない場合は空配列を返す
    if (visibleMessages.length === 0) {
      return NextResponse.json([]);
    }

    // ✅ PresetMessageを取得（countフィルタを削除）
    const presetMessages = await prisma.presetMessage.findMany({
      where: {
        // count: { gt: 0 }, ← このフィルタを削除
        lastSentAt: { gte: expiryDate }, // 24時間以内のメッセージのみ取得
        content: { in: visibleMessages },
      },
      orderBy: { lastSentAt: "desc" },
      select: {
        id: true,
        content: true,
        createdBy: true,
        createdAt: true,
        count: true, // この値は後で上書きされる
        senderCount: true, // この値は後で上書きされる
        linkTitle: true,
        linkImage: true,
        lastSentAt: true,
      },
    });

    // ✅ 各PresetMessageについて、実際のcountとsenderCountを計算
    const messagesWithActualCounts = await Promise.all(
      presetMessages.map(async (msg) => {
        // 実際のSentMessageの数を動的に計算（非表示を除外、24時間以内）
        const actualCount = await prisma.sentMessage.count({
          where: {
            message: msg.content,
            isHidden: false,
            createdAt: { gte: expiryDate },
          },
        });

        // 実際のcountが0の場合は除外
        if (actualCount === 0) {
          return null;
        }

        // 実際のユニーク送信者数を動的に計算（非表示を除外、24時間以内）
        const uniqueSenders = await prisma.sentMessage.findMany({
          where: {
            message: msg.content,
            isHidden: false,
            createdAt: { gte: expiryDate },
          },
          select: { senderId: true },
          distinct: ["senderId"],
        });
        const actualSenderCount = uniqueSenders.length;

        return {
          ...msg,
          count: actualCount,
          senderCount: actualSenderCount,
        };
      })
    );

    // ✅ バッチ処理で自分宛のメッセージを一度に取得（パフォーマンス最適化）
    const sentToMeMap = new Map<string, { senderId: string; senderName: string }[]>();
    
    if (userId) {
      // nullを除外した有効なメッセージのみを対象にする
      const validMessages = messagesWithActualCounts.filter(
        (msg): msg is NonNullable<typeof msg> => msg !== null
      );
      
      if (validMessages.length > 0) {
        const messageContents = validMessages.map(m => m.content);
        
        // 自分宛に送られたメッセージを全て取得
        const allSentToMe = await prisma.sentMessage.findMany({
          where: {
            receiverId: userId,
            message: { in: messageContents },
            isHidden: false,
            createdAt: { gte: expiryDate },
          },
          include: {
            sender: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        // メッセージごとにグループ化して、全送信者を配列で保持
        allSentToMe.forEach(msg => {
          if (!sentToMeMap.has(msg.message)) {
            sentToMeMap.set(msg.message, []);
          }
          const senders = sentToMeMap.get(msg.message)!;
          // 重複チェック（同じ人が複数回送信した場合は1回だけ表示）
          if (!senders.some(s => s.senderId === msg.sender.id)) {
            senders.push({
              senderId: msg.sender.id,
              senderName: msg.sender.name,
            });
          }
        });
      }
    }

    // ✅ 各メッセージに送信者情報を追加
    const messagesWithSentToMe = messagesWithActualCounts.map(msg => {
      if (msg === null) return null;
      return {
        ...msg,
        sentToMe: sentToMeMap.get(msg.content) || undefined,
      };
    });

    // nullを除外して返す
    const validMessages = messagesWithSentToMe.filter(
      (msg): msg is NonNullable<typeof msg> => msg !== null
    );

    return NextResponse.json(validMessages);
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
      // 実際のユニーク送信者数を動的に計算（より確実な方法）
      // ✅ 非表示メッセージは除外
      const uniqueSenders = await prisma.sentMessage.findMany({
        where: {
          message: content,
          isHidden: false, // ← 追加
        },
        select: { senderId: true },
        distinct: ["senderId"],
      });
      const actualSenderCount = uniqueSenders.length;

      console.log(`[preset-message] 送信者判定:`, {
        createdBy,
        content,
        actualSenderCount,
        currentSenderCount: existingMessage.senderCount,
        uniqueSenders: uniqueSenders.map((s) => s.senderId),
      });

      const updateData = {
        count: existingMessage.count + 1,
        // 実際のユニーク送信者数を使用
        senderCount: actualSenderCount,
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
