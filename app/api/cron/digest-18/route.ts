// app/api/cron/digest-18/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import webpush, { PushSubscription as WebPushSubscription } from "web-push";
import { translate } from "@/lib/translations";

const prisma = new PrismaClient();

// 個人向けダイジェスト用：過去24時間に新規受信した未マッチ件数を取得
async function getNewUnmatchedReceivedCount24h(
  userId: string
): Promise<number> {
  try {
    // 自分が受信したメッセージのうち、直近24時間に届いたものを取得（非表示を除外）
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReceivedMessages = await prisma.sentMessage.findMany({
      where: {
        receiverId: userId,
        createdAt: { gte: twentyFourHoursAgo },
        isHidden: false, // ← 追加
      },
      select: {
        id: true,
        senderId: true,
        message: true,
        createdAt: true,
      },
    });

    let unmatchedCount = 0;

    for (const receivedMessage of recentReceivedMessages) {
      // このメッセージについて、マッチが成立しているかチェック
      const matchExists = await prisma.matchPair.findFirst({
        where: {
          message: receivedMessage.message,
          OR: [
            { user1Id: receivedMessage.senderId, user2Id: userId },
            { user1Id: userId, user2Id: receivedMessage.senderId },
          ],
        },
      });

      // マッチが存在しない場合のみカウント対象とする
      if (!matchExists) {
        unmatchedCount++;
      }
    }

    return unmatchedCount;
  } catch (error) {
    console.error("Error counting unmatched messages:", error);
    return 0;
  }
}

webpush.setVapidDetails(
  "mailto:you@domain.com",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// web-push のエラーから statusCode を安全に引き出すユーティリティ
function getStatusCode(reason: unknown): number | undefined {
  if (typeof reason === "object" && reason !== null) {
    const val = (reason as Record<string, unknown>)["statusCode"];
    if (typeof val === "number") return val;
  }
  return undefined;
}

// JST の当日 0:00〜18:00 を UTC に変換して返す
function jstWindowUtc() {
  const now = new Date();
  // JST = UTC+9 → 「いま」を JST に合わせて日付成分を切り出す
  const nowJst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  // JST 00:00 → UTC で -9:00、JST 18:00 → UTC で +9:00
  const startUTC = new Date(Date.UTC(y, m, d, -9, 0, 0));
  const endUTC = new Date(Date.UTC(y, m, d, 9, 0, 0));
  // 返す文字列キー（任意、ログ用）
  const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(
    2,
    "0"
  )}`;
  return { startUTC, endUTC, dateKey };
}

// 複数購読へ push を送り、404/410 を拾って「無効化すべき endpoint」を返す
async function sendToSubs(
  subs: { endpoint: string; subscription: unknown }[],
  payload: string
): Promise<string[]> {
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(s.subscription as WebPushSubscription, payload)
    )
  );
  const toDeactivate: string[] = [];
  results.forEach((r, idx) => {
    if (r.status === "rejected") {
      const code = getStatusCode(r.reason);
      if (code === 404 || code === 410) {
        toDeactivate.push(subs[idx].endpoint);
      }
    }
  });
  return toDeactivate;
}

export async function GET() {
  try {
    const { startUTC, endUTC, dateKey } = jstWindowUtc();

    // 1) 全体：その日 0-18 時の presetMessage 件数
    const globalCount = await prisma.presetMessage.count({
      where: { createdAt: { gte: startUTC, lt: endUTC } },
    });

    // 2) 有効な Push 購読を取得して userId → 購読配列にマップ
    const allActiveSubs = await prisma.pushSubscription.findMany({
      where: { isActive: true },
      select: { endpoint: true, subscription: true, userId: true },
    });

    const subsByUser = new Map<
      string,
      { endpoint: string; subscription: unknown }[]
    >();
    for (const s of allActiveSubs) {
      const arr = subsByUser.get(s.userId) ?? [];
      arr.push({ endpoint: s.endpoint, subscription: s.subscription });
      subsByUser.set(s.userId, arr);
    }

    // 無効化対象 endpoint を集約する集合（重複排除）
    const endpointsToDeactivate = new Set<string>();

    // ユーザーの言語設定を一括取得
    const allUserIds = Array.from(subsByUser.keys());
    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, language: true },
    });
    const userLanguages = new Map<string, "ja" | "en">();
    users.forEach((u) => {
      userLanguages.set(u.id, (u.language === "en" ? "en" : "ja") as "ja" | "en");
    });

    // 3) 個人配信（過去24時間の新規受信・未マッチ件数）
    for (const [userId, subs] of subsByUser) {
      if (!subs?.length) continue;

      const unmatchedCount = await getNewUnmatchedReceivedCount24h(userId);
      if (unmatchedCount === 0) continue;

      const userLanguage = userLanguages.get(userId) || "ja";

      const payload = JSON.stringify({
        type: "digest_user",
        title: translate(userLanguage, "notification.digestNewMessage"),
        body: translate(userLanguage, "notification.digestUserNew", {
          n: unmatchedCount,
        }),
        dateKey,
      });

      const deact = await sendToSubs(subs, payload);
      deact.forEach((ep) => endpointsToDeactivate.add(ep));
    }

    // 5) 全体配信（0 件なら送らない）
    // 全体配信は各ユーザーの言語設定に応じて個別に送信
    if (globalCount > 0 && allActiveSubs.length > 0) {
      // 全ユーザーの言語設定を取得
      const allSubUserIds = Array.from(
        new Set(allActiveSubs.map((s) => s.userId))
      );
      const allUsers = await prisma.user.findMany({
        where: { id: { in: allSubUserIds } },
        select: { id: true, language: true },
      });
      const allUserLanguages = new Map<string, "ja" | "en">();
      allUsers.forEach((u) => {
        allUserLanguages.set(
          u.id,
          (u.language === "en" ? "en" : "ja") as "ja" | "en"
        );
      });

      // ユーザーごとに言語設定に応じた通知を送信
      const subsByUserForGlobal = new Map<
        string,
        { endpoint: string; subscription: unknown }[]
      >();
      for (const s of allActiveSubs) {
        const arr = subsByUserForGlobal.get(s.userId) ?? [];
        arr.push({ endpoint: s.endpoint, subscription: s.subscription });
        subsByUserForGlobal.set(s.userId, arr);
      }

      for (const [userId, subs] of subsByUserForGlobal) {
        const userLanguage = allUserLanguages.get(userId) || "ja";
        const payloadGlobal = JSON.stringify({
          type: "digest_global",
          title: translate(userLanguage, "notification.digestGlobalTitle"),
          body: translate(userLanguage, "notification.digestGlobalBody", {
            n: globalCount,
          }),
          dateKey,
        });

        const deact = await sendToSubs(subs, payloadGlobal);
        deact.forEach((ep) => endpointsToDeactivate.add(ep));
      }
    }

    // 6) 404/410 の購読をまとめて無効化
    if (endpointsToDeactivate.size > 0) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint: { in: Array.from(endpointsToDeactivate) } },
        data: { isActive: false },
      });
    }

    return NextResponse.json({
      ok: true,
      windowUtc: {
        startUTC: startUTC.toISOString(),
        endUTC: endUTC.toISOString(),
      },
      personalRecipients: Array.from(subsByUser.keys()).length,
      globalCount,
      deactivated: endpointsToDeactivate.size,
    });
  } catch (err) {
    console.error("🚨 digest-18 failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
