import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import webpush, { PushSubscription as WebPushSubscription } from "web-push";
import { io as ioClient } from "socket.io-client";
import { shouldHideMessage } from "@/lib/content-filter";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

// VAPID 鍵の設定
webpush.setVapidDetails(
  "https://happy-ice-cream.vercel.app",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// 2人間のチャットIDを必ず返す（なければ作る）
async function ensureChatBetween(a: string, b: string): Promise<string> {
  const found = await prisma.chat.findFirst({
    where: {
      OR: [
        { user1Id: a, user2Id: b },
        { user1Id: b, user2Id: a },
      ],
    },
    select: { id: true },
  });
  if (found) return found.id;

  // 正順で作成（重複防止）
  const [u1, u2] = a < b ? [a, b] : [b, a];
  const created = await prisma.chat.create({
    data: { user1Id: u1, user2Id: u2 },
    select: { id: true },
  });
  return created.id;
}

export async function POST(req: NextRequest) {
  try {
    const { senderId, receiverIds, message, linkTitle, linkImage } =
      await req.json();

    if (!senderId || !receiverIds?.length || !message) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // リンクの場合はメタデータを取得
    let finalLinkTitle = linkTitle;
    let finalLinkImage = linkImage;

    console.log(`[match-message] メッセージ: ${message}`);
    console.log(
      `[match-message] 既存メタデータ: title=${linkTitle}, image=${linkImage}`
    );
    console.log(`[match-message] リクエストボディ全体:`, {
      senderId,
      receiverIds,
      message,
      linkTitle,
      linkImage,
    });

    if (message.startsWith("http") && (!linkTitle || !linkImage)) {
      // リンク+テキストの場合はリンク部分のみを抽出
      // 全角スペースを半角スペースに変換してからURL抽出
      const normalizedMessage = message.replace(/　/g, " ");
      let urlToFetch = message;

      // スペースありの場合をチェック
      const spaceMatch = normalizedMessage.match(
        /^(https?:\/\/[^\s]+)\s+(.+)$/i
      );
      if (spaceMatch) {
        urlToFetch = spaceMatch[1];
        console.log(`[match-message] スペースあり - URL: ${urlToFetch}`);
      } else {
        // スペースなしの場合をチェック（URLの後に直接テキストが続く場合）
        const directMatch = normalizedMessage.match(
          /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%].+)$/
        );
        if (directMatch && directMatch[2]) {
          urlToFetch = directMatch[1];
          console.log(
            `[match-message] スペースなし - URL: ${urlToFetch}, Text: ${directMatch[2]}`
          );
        } else {
          // URLのみの場合
          const urlOnlyMatch = normalizedMessage.match(
            /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)$/
          );
          urlToFetch = urlOnlyMatch ? urlOnlyMatch[1] : message;
          console.log(`[match-message] URLのみ - URL: ${urlToFetch}`);
        }
      }

      console.log(`[match-message] リンクメタデータを取得中: ${urlToFetch}`);
      try {
        const previewResponse = await fetch(
          `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          }/api/link-preview?url=${encodeURIComponent(urlToFetch)}`
        );
        console.log(
          `[match-message] プレビューAPI応答: ${previewResponse.status}`
        );
        if (previewResponse.ok) {
          const previewData = await previewResponse.json();
          console.log(`[match-message] 取得したメタデータ:`, previewData);
          finalLinkTitle = previewData.title || linkTitle;
          finalLinkImage = previewData.image || linkImage;
        }
      } catch (error) {
        console.error("リンクプレビュー取得エラー:", error);
      }
    }

    console.log(
      `[match-message] 最終メタデータ: title=${finalLinkTitle}, image=${finalLinkImage}`
    );

    let matchedUserId: string | null = null;
    let myLatestCreatedAt: Date | null = null;

    // ✅ キーワードチェック（メッセージ送信前にチェック）
    const isHidden = shouldHideMessage(message);

    // 1) 送信メッセージを保存しつつ、マッチを探す
    for (const receiverId of receiverIds) {
      // 自分の送信をまず保存（createdAt を取得）
      const mySend = await prisma.sentMessage.create({
        data: {
          senderId,
          receiverId,
          message,
          linkTitle: finalLinkTitle,
          linkImage: finalLinkImage,
          isHidden: isHidden, // ← 追加
        },
        select: { id: true, createdAt: true },
      });
      myLatestCreatedAt = mySend.createdAt;

      // ✅ 非表示メッセージはマッチ判定から除外
      if (isHidden) {
        // 非表示メッセージはマッチ判定をスキップ
        continue;
      }

      // この2人 & この message の直近マッチを取得
      const lastMatch = await prisma.matchPair.findFirst({
        where: {
          message,
          OR: [
            { user1Id: senderId, user2Id: receiverId },
            { user1Id: receiverId, user2Id: senderId },
          ],
        },
        orderBy: { matchedAt: "desc" },
        select: { matchedAt: true },
      });
      const since = lastMatch?.matchedAt ?? new Date(0);

      // 「前回マッチ以降」に相手が自分宛に同じ message を送っているか
      // ✅ 非表示メッセージは除外
      const reciprocalAfterLastMatch = await prisma.sentMessage.findFirst({
        where: {
          senderId: receiverId,
          receiverId: senderId,
          message,
          createdAt: { gt: since },
          isHidden: false, // ← 追加
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });

      // 相手の送信が「前回マッチ以降」に存在すればマッチ成立
      if (reciprocalAfterLastMatch) {
        matchedUserId = receiverId;
        break;
      }
      // なければ次の候補ユーザーへ（マッチはまだ）
    }

    // PresetMessage の集計（マッチ成立/不成立に関係なく実行）
    console.log(`[match-message] PresetMessage処理開始: ${message}`);
    const existingPresetMessage = await prisma.presetMessage.findFirst({
      where: { content: message },
    });
    if (existingPresetMessage) {
      // 実際のユニーク送信者数を動的に計算（より確実な方法）
      // ✅ 非表示メッセージは除外
      const uniqueSenders = await prisma.sentMessage.findMany({
        where: {
          message: message,
          isHidden: false, // ← 追加
        },
        select: { senderId: true },
        distinct: ["senderId"],
      });
      const actualSenderCount = uniqueSenders.length;

      console.log(`[match-message] 送信者判定:`, {
        senderId,
        message,
        actualSenderCount,
        currentSenderCount: existingPresetMessage.senderCount,
        uniqueSenders: uniqueSenders.map((s) => s.senderId),
      });

      const updateData = {
        count: existingPresetMessage.count + 1,
        // 実際のユニーク送信者数を使用
        senderCount: actualSenderCount,
        lastSentAt: new Date(), // メッセージ送信時に必ず時刻をリセット
        // リンクメタデータが提供された場合は更新
        ...(finalLinkTitle && { linkTitle: finalLinkTitle }),
        ...(finalLinkImage && { linkImage: finalLinkImage }),
      };
      console.log(`[match-message] 既存PresetMessage更新:`, updateData);
      await prisma.presetMessage.update({
        where: { id: existingPresetMessage.id },
        data: updateData,
      });
      console.log(`[match-message] PresetMessage更新完了`);
    } else {
      const createData = {
        content: message,
        createdBy: senderId,
        count: 1,
        senderCount: 1, // 新規作成時は送信者数も1
        linkTitle: finalLinkTitle || null,
        linkImage: finalLinkImage || null,
      };
      console.log(`[match-message] 新規PresetMessage作成:`, createData);
      await prisma.presetMessage.create({
        data: createData,
      });
      console.log(`[match-message] PresetMessage作成完了`);
    }

    // 2) マッチ成立時の処理
    if (matchedUserId) {
      // ユーザー情報
      const senderUser = await prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, name: true },
      });
      const matchedUser = await prisma.user.findUnique({
        where: { id: matchedUserId },
        select: { id: true, name: true },
      });
      if (!senderUser || !matchedUser) {
        throw new Error("User not found");
      }

      // 直近の二重作成を避けるため、マッチ作成前に最終確認（同一ペア & message の直近マッチが直近N秒にないか）
      // 競合対策の“保険”。必要なければ省略可。
      const duplicateGuard = await prisma.matchPair.findFirst({
        where: {
          message,
          OR: [
            { user1Id: senderId, user2Id: matchedUserId },
            { user1Id: matchedUserId, user2Id: senderId },
          ],
        },
        orderBy: { matchedAt: "desc" },
        select: { id: true, matchedAt: true },
      });
      if (duplicateGuard && myLatestCreatedAt) {
        // もしすでに自分の送信時刻より新しいマッチが存在すれば再作成しない
        if (duplicateGuard.matchedAt >= myLatestCreatedAt) {
          // 既存を採用（以降の処理は継続）
        }
      }

      // MatchPair（履歴）
      const newMatchPair = await prisma.matchPair.create({
        data: { user1Id: senderId, user2Id: matchedUserId, message },
      });

      // 2人のチャットIDを確保（無ければ作成）
      const chatId = await ensureChatBetween(senderId, matchedUserId);

      // Web Push 通知（両者）
      const subs = await prisma.pushSubscription.findMany({
        where: {
          OR: [
            { userId: senderId, isActive: true },
            { userId: matchedUserId, isActive: true },
          ],
        },
      });
      await Promise.all(
        subs.map((s) => {
          const other = s.userId === senderId ? matchedUser : senderUser;
          const payload = JSON.stringify({
            type: "match",
            matchId: newMatchPair.id,
            title: "マッチング成立！",
            body: `あなたは ${other.name} さんと「${message}」でマッチしました！`,
            matchedUserId: other.id,
            matchedUserName: other.name,
            chatId,
          });
          return webpush.sendNotification(
            s.subscription as unknown as WebPushSubscription,
            payload
          );
        })
      );

      // WebSocket でリアルタイム通知
      const socket = ioClient(SOCKET_URL, { transports: ["websocket"] });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Socket.IO接続タイムアウト"));
          }, 5000);

          socket.on("connect", () => {
            clearTimeout(timeout);
            console.log(`✅ Socket.IOサーバーに接続成功: ${socket.id}`);
            resolve();
          });

          socket.on("connect_error", (error) => {
            clearTimeout(timeout);
            console.error(`❌ Socket.IO接続エラー:`, error);
            reject(error);
          });
        });

        const payload = {
          matchId: newMatchPair.id,
          chatId,
          message,
          matchedAt: newMatchPair.matchedAt.toISOString(),
        };

        // 送信者向け（先に送った側）
        socket.emit("matchEstablished", {
          ...payload,
          matchedUserId: matchedUser.id,
          matchedUserName: matchedUser.name,
          targetUserId: senderId,
        });

        // 受信者向け（後に送った側）
        socket.emit("matchEstablished", {
          ...payload,
          matchedUserId: senderUser.id,
          matchedUserName: senderUser.name,
          targetUserId: matchedUserId,
        });

        console.log(`✅ マッチ通知送信完了: ${senderId} と ${matchedUserId}`);
      } catch (e) {
        console.error("⚠️ WebSocket通知送信失敗（継続）:", e);
        // 通知はベストエフォートなので続行
      } finally {
        setTimeout(() => socket.disconnect(), 50);
      }

      return NextResponse.json({
        message: "Match created!",
        matchedUserId: matchedUser.id,
        matchedUserName: matchedUser.name,
        chatId,
      });
    }

    // マッチ未成立
    // ✅ 非表示メッセージの場合はマッチ成立させない
    if (isHidden) {
      return NextResponse.json({
        message: "Message sent (hidden)",
        hidden: true,
      });
    }

    return NextResponse.json({ message: "Message sent, waiting for a match!" });
  } catch (error) {
    console.error("🚨 マッチングエラー:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
