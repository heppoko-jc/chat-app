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

// webpush のエラーから statusCode を安全に引き出すユーティリティ
function getStatusCode(reason: unknown): number | undefined {
  if (typeof reason === "object" && reason !== null) {
    const val = (reason as Record<string, unknown>)["statusCode"];
    if (typeof val === "number") return val;
  }
  return undefined;
}

// SentMessage受信時の通知送信（非同期、リトライ付き）
async function sendSentMessageNotification(
  receiverId: string,
  senderId: string,
  maxRetries: number = 3
): Promise<void> {
  try {
    // フォロー関係を判定
    const isFollowing = await prisma.friend.findFirst({
      where: {
        userId: receiverId,
        friendId: senderId,
      },
    });

    // 通知タイトルと本文を決定
    const title = "新規メッセージ";
    const body = isFollowing
      ? "誰かからメッセージが届きました（たった今）"
      : "フォローしていない誰かからメッセージが届きました（たった今）";

    // 受信者のプッシュ購読を取得
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: receiverId, isActive: true },
    });

    if (subs.length === 0) {
      console.log(
        `[match-message] 通知送信スキップ: 購読なし (receiverId: ${receiverId})`
      );
      return;
    }

    // 通知ペイロード
    const payload = JSON.stringify({
      type: "sent_message",
      title,
      body,
      senderId, // 通知タグ用
    });

    // リトライ付きで通知送信
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const results = await Promise.allSettled(
          subs.map((s) =>
            webpush.sendNotification(
              s.subscription as unknown as WebPushSubscription,
              payload
            )
          )
        );

        // 無効な購読を特定
        const toDeactivate: string[] = [];
        results.forEach((r, idx) => {
          if (r.status === "rejected") {
            const status = getStatusCode(r.reason);
            if (status === 404 || status === 410) {
              toDeactivate.push(subs[idx].endpoint);
            } else {
              // その他のエラーは記録
              lastError = r.reason;
            }
          }
        });

        // 無効な購読を無効化
        if (toDeactivate.length > 0) {
          await prisma.pushSubscription.updateMany({
            where: { endpoint: { in: toDeactivate } },
            data: { isActive: false },
          });
          console.log(
            `[match-message] 無効な購読を無効化: ${toDeactivate.length}件 (receiverId: ${receiverId})`
          );
        }

        // 成功した場合（少なくとも1つの通知が成功）
        const successCount = results.filter(
          (r) => r.status === "fulfilled"
        ).length;
        if (successCount > 0) {
          console.log(
            `[match-message] 通知送信成功: ${successCount}/${subs.length} (receiverId: ${receiverId}, attempt: ${attempt})`
          );
          return; // 成功したら終了
        }

        // 全て失敗した場合、最後の試行でなければリトライ
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 指数バックオフ（最大5秒）
          console.log(
            `[match-message] 通知送信失敗、リトライ待機: ${delay}ms (receiverId: ${receiverId}, attempt: ${attempt}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(
            `[match-message] 通知送信エラー、リトライ待機: ${delay}ms (receiverId: ${receiverId}, attempt: ${attempt}/${maxRetries})`,
            error
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // 全てのリトライが失敗した場合
    console.error(
      `[match-message] 通知送信失敗（全リトライ終了）: receiverId=${receiverId}, senderId=${senderId}`,
      lastError
    );
  } catch (error) {
    // フォロー関係判定などのDBエラー
    console.error(
      `[match-message] 通知送信処理エラー: receiverId=${receiverId}, senderId=${senderId}`,
      error
    );
    // エラーが発生してもメッセージ送信処理は継続（ベストエフォート）
  }
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

    const matchedCandidates: {
      receiverId: string;
      reciprocalCreatedAt: Date;
      mySendCreatedAt: Date;
    }[] = [];

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
          isHidden: isHidden,
        },
        select: { id: true, createdAt: true },
      });
      const mySendCreatedAt = mySend.createdAt;

      // ✅ SentMessage受信時の通知送信（非表示メッセージ以外）
      if (!isHidden) {
        // 非同期で通知送信（メイン処理をブロックしない）
        sendSentMessageNotification(receiverId, senderId).catch((error) => {
          console.error(
            `[match-message] 通知送信の非同期処理エラー: receiverId=${receiverId}`,
            error
          );
        });
      }

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
        matchedCandidates.push({
          receiverId,
          reciprocalCreatedAt: reciprocalAfterLastMatch.createdAt,
          mySendCreatedAt,
        });
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

    // 2) マッチ成立時の処理（複数対応）
    if (matchedCandidates.length > 0) {
      const senderUser = await prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, name: true },
      });
      if (!senderUser) {
        throw new Error("Sender user not found");
      }

      const matchResults: {
        matchedUserId: string;
        matchedUserName: string;
        chatId: string;
      }[] = [];

      for (const candidate of matchedCandidates) {
        const { receiverId, reciprocalCreatedAt, mySendCreatedAt } = candidate;

        const matchedUser = await prisma.user.findUnique({
          where: { id: receiverId },
          select: { id: true, name: true },
        });
        if (!matchedUser) {
          console.warn(
            "[match-message] matchedUser not found, skipping:",
            receiverId
          );
          continue;
        }

        const guardThresholdMillis = Math.min(
          reciprocalCreatedAt.getTime(),
          mySendCreatedAt.getTime()
        );
        const guardThreshold = new Date(guardThresholdMillis - 2000); // 2秒の余裕

        const existingMatch = await prisma.matchPair.findFirst({
          where: {
            message,
            OR: [
              { user1Id: senderId, user2Id: receiverId },
              { user1Id: receiverId, user2Id: senderId },
            ],
            matchedAt: { gte: guardThreshold },
          },
          orderBy: { matchedAt: "desc" },
          select: { id: true, matchedAt: true },
        });

        let matchPairId: string;
        let matchPairMatchedAt: Date;
        let isNewlyCreated = false;

        if (existingMatch) {
          matchPairId = existingMatch.id;
          matchPairMatchedAt = existingMatch.matchedAt;
        } else {
          const newMatchPair = await prisma.matchPair.create({
            data: { user1Id: senderId, user2Id: receiverId, message },
          });
          matchPairId = newMatchPair.id;
          matchPairMatchedAt = newMatchPair.matchedAt;
          isNewlyCreated = true;
        }

        const chatId = await ensureChatBetween(senderId, receiverId);

        if (isNewlyCreated) {
          const subs = await prisma.pushSubscription.findMany({
            where: {
              OR: [
                { userId: senderId, isActive: true },
                { userId: receiverId, isActive: true },
              ],
            },
          });
          await Promise.all(
            subs.map((s) => {
              const other = s.userId === senderId ? matchedUser : senderUser;
              const payload = JSON.stringify({
                type: "match",
                matchId: matchPairId,
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
              matchId: matchPairId,
              chatId,
              message,
              matchedAt: matchPairMatchedAt.toISOString(),
            };

            socket.emit("matchEstablished", {
              ...payload,
              matchedUserId: matchedUser.id,
              matchedUserName: matchedUser.name,
              targetUserId: senderId,
            });

            socket.emit("matchEstablished", {
              ...payload,
              matchedUserId: senderUser.id,
              matchedUserName: senderUser.name,
              targetUserId: receiverId,
            });

            console.log(`✅ マッチ通知送信完了: ${senderId} と ${receiverId}`);
          } catch (e) {
            console.error("⚠️ WebSocket通知送信失敗（継続）:", e);
          } finally {
            setTimeout(() => socket.disconnect(), 50);
          }
        }

        matchResults.push({
          matchedUserId: matchedUser.id,
          matchedUserName: matchedUser.name,
          chatId,
        });
      }

      if (matchResults.length > 0) {
        const primary = matchResults[0];
        return NextResponse.json({
          message: "Match created!",
          matchedUserId: primary.matchedUserId,
          matchedUserName: primary.matchedUserName,
          chatId: primary.chatId,
          matchedUsers: matchResults,
        });
      }
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
