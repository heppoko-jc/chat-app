// app/api/notifications/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMatchExpiryDate } from "@/lib/match-utils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    // ✅ 自分が送信したマッチメッセージ履歴（非表示を除外）
    const sentMessages = await prisma.sentMessage.findMany({
      where: {
        senderId: userId,
        isHidden: false, // ← 追加
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        message: true,
        linkTitle: true,
        linkImage: true,
        createdAt: true,
        isHidden: true,
        shortcutId: true,
        replyText: true,
        receiver: { select: { id: true, name: true } },
        shortcut: { select: { id: true, name: true } }, // ショートカット情報を取得
        // 返信情報を含める
        replyToMessage: {
          select: {
            id: true,
            senderId: true,
            receiverId: true,
            message: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ✅ 自分宛に届いた「返信付き」メッセージ（受信側にも履歴表示するため）
    const receivedReplies = await prisma.sentMessage.findMany({
      where: {
        receiverId: userId,
        isHidden: false,
        NOT: { replyText: null },
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        message: true,
        linkTitle: true,
        linkImage: true,
        createdAt: true,
        replyText: true,
        sender: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // ✅ 自分のマッチング履歴
    const matchedPairs = await prisma.matchPair.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
      },
      orderBy: { matchedAt: "desc" },
    });

    // PresetMessageのlastSentAtを取得（期限切れ判定用）
    const presetMessages = await prisma.presetMessage.findMany({
      select: {
        content: true,
        lastSentAt: true,
      },
    });

    const presetMessageMap = new Map(
      presetMessages.map((pm) => [pm.content, pm.lastSentAt])
    );

    const expiryDate = getMatchExpiryDate();

    // ✅ 送信済みメッセージとマッチ済みメッセージの照合
    const updatedSentMessages = sentMessages.map((msg) => ({
      ...msg,
      direction: "sent" as const,
      isMatched: matchedPairs.some(
        (match) =>
          match.message === msg.message &&
          (match.user1.id === msg.receiver.id ||
            match.user2.id === msg.receiver.id)
      ),
      // 期限切れ判定：PresetMessageのlastSentAtが24時間以上前
      isExpired:
        presetMessageMap.has(msg.message) &&
        presetMessageMap.get(msg.message)! < expiryDate,
      // ショートカット情報を追加
      shortcutName: msg.shortcut?.name || null,
      shortcutId: msg.shortcutId || null,
    }));

    // ✅ 受信側としても履歴に含める（返信付きのみ）
    const receivedAsSentMessages = receivedReplies.map((msg) => ({
      id: msg.id,
      // With 相手名で出すため、receiver を相手（送信者）にする
      receiver: { id: msg.sender?.id ?? "", name: msg.sender?.name ?? "" },
      message: msg.message,
      linkTitle: msg.linkTitle || undefined,
      linkImage: msg.linkImage || undefined,
      createdAt: msg.createdAt,
      isMatched: true,
      isExpired: false,
      shortcutName: null,
      shortcutId: null,
      replyText: msg.replyText,
      replyToMessage: null,
      direction: "received" as const,
      sender: msg.sender, // UIでFrom表記に使う
    }));

    // 送信分と受信分を統合
    // 同じメッセージを同じ相手に複数回送った場合は全て表示するため、
    // 重複排除は送信側と受信側の両方がある場合（返信の場合）のみ行う
    const merged = [...updatedSentMessages, ...receivedAsSentMessages];
    const result: (typeof merged)[number][] = [];
    const processedIds = new Set<string>();
    
    for (const m of merged) {
      // 既に処理済みの場合はスキップ
      if (processedIds.has(m.id)) {
        continue;
      }
      
      const otherId =
        m.direction === "received" ? m.sender?.id ?? m.receiver.id : m.receiver.id;
      
      // 送信側と受信側の両方がある場合（返信の場合）を探す
      // 同じメッセージ、同じ相手で、逆方向のエントリを探す
      const oppositeDirection = m.direction === "sent" ? "received" : "sent";
      const oppositeEntry = merged.find((other) => {
        if (
          other.id === m.id ||
          processedIds.has(other.id) ||
          other.direction !== oppositeDirection ||
          other.message !== m.message
        ) {
          return false;
        }
        // received の場合は sender を、sent の場合は receiver をチェック
        if (oppositeDirection === "received") {
          const otherSenderId =
            "sender" in other && other.sender ? other.sender.id : null;
          return otherSenderId === otherId;
        } else {
          return other.receiver.id === otherId;
        }
      });
      
      if (oppositeEntry) {
        // 送信側と受信側の両方がある場合（返信の場合）
        // 返信テキストを含む方を優先
        const mHasReply = !!m.replyText;
        const oppositeHasReply = !!oppositeEntry.replyText;
        
        if (mHasReply && !oppositeHasReply) {
          // 現在が返信あり、相手が返信なし → 現在を採用
          result.push(m);
          processedIds.add(m.id);
          processedIds.add(oppositeEntry.id);
        } else if (!mHasReply && oppositeHasReply) {
          // 現在が返信なし、相手が返信あり → 相手を採用
          result.push(oppositeEntry);
          processedIds.add(m.id);
          processedIds.add(oppositeEntry.id);
        } else {
          // 両方返信あり、または両方返信なし → 送信側を優先
          if (m.direction === "sent") {
            result.push(m);
            processedIds.add(m.id);
            processedIds.add(oppositeEntry.id);
          } else {
            result.push(oppositeEntry);
            processedIds.add(m.id);
            processedIds.add(oppositeEntry.id);
          }
        }
      } else {
        // 重複がない場合はそのまま追加
        result.push(m);
        processedIds.add(m.id);
      }
    }

    return NextResponse.json({
      sentMessages: result,
      matchedPairs,
    });
  } catch (error) {
    console.error("🚨 通知データ取得エラー:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
