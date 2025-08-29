// app/api/chat/[chatId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { io as ioClient } from "socket.io-client";
import webpush, { PushSubscription as WebPushSubscription } from "web-push";

const prisma = new PrismaClient();
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

// VAPID 鍵の設定
webpush.setVapidDetails(
  "https://happy-ice-cream.vercel.app",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// unknown から statusCode を安全に取り出すヘルパー（no-explicit-any 回避）
function getStatusCode(reason: unknown): number | undefined {
  if (typeof reason === "object" && reason !== null) {
    const val = (reason as Record<string, unknown>)["statusCode"];
    if (typeof val === "number") return val;
  }
  return undefined;
}

/**
 * GET /api/chat/[chatId]
 */
export async function GET(req: NextRequest) {
  try {
    const { pathname } = new URL(req.url);
    const segments = pathname.split("/");
    const chatId = segments[segments.length - 1];

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID が指定されていません" },
        { status: 400 }
      );
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { id: true, name: true } } },
        },
      },
    });

    if (!chat) {
      return NextResponse.json(
        { error: "指定されたチャットが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json(chat.messages);
  } catch (error) {
    console.error("🚨 チャット取得エラー:", error);
    return NextResponse.json(
      { error: "メッセージ取得に失敗しました" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chat/[chatId]
 * DB にメッセージを保存 → Socket.IO → Web Push
 */
export async function POST(req: NextRequest) {
  try {
    const { pathname } = new URL(req.url);
    const segments = pathname.split("/");
    const chatId = segments[segments.length - 1];

    const { senderId, content } = await req.json();

    if (!chatId || !senderId || !content) {
      return NextResponse.json(
        { error: "chatId, senderId, content はすべて必須です" },
        { status: 400 }
      );
    }

    // チャットの存在確認
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) {
      return NextResponse.json(
        { error: "指定されたチャットが見つかりません" },
        { status: 404 }
      );
    }

    // メッセージ保存
    const newMessage = await prisma.message.create({
      data: { chatId, senderId, content },
      include: { sender: { select: { id: true, name: true } } },
    });

    // 受信者
    const receiverId = chat.user1Id === senderId ? chat.user2Id : chat.user1Id;

    // → Socket.IO でリアルタイム配信（接続完了を待ってから emit）
    try {
      const socket = ioClient(SOCKET_URL, { transports: ["websocket"] });
      await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
      socket.emit("sendMessage", { chatId, toUserId: receiverId, message: newMessage });
      setTimeout(() => socket.disconnect(), 50);
    } catch (e) {
      console.error("⚠️ Socket.IO relay failed:", e);
      // 通知はベストエフォートなので続行
    }

    // → Web Push 通知
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: receiverId, isActive: true },
    });

    const payload = JSON.stringify({
      type: "message",
      chatId,
      title: `${newMessage.sender.name} さんから新着メッセージ`,
      body: newMessage.content,
    });

    // 失敗購読の自動無効化（404/410）— any を使わずに判定
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          s.subscription as unknown as WebPushSubscription,
          payload
        )
      )
    );

    const toDeactivate: string[] = [];
    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        const status = getStatusCode(r.reason);
        if (status === 404 || status === 410) {
          toDeactivate.push(subs[idx].endpoint);
        }
      }
    });

    if (toDeactivate.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: toDeactivate } },
        data: { isActive: false },
      });
    }

    return NextResponse.json(newMessage);
  } catch (error) {
    console.error("🚨 メッセージ送信エラー:", error);
    return NextResponse.json(
      { error: "メッセージ送信に失敗しました" },
      { status: 500 }
    );
  }
}