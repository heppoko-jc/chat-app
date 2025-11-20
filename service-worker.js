/* global self, clients */
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js"
);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

// Workbox InjectManifest：ビルド時に __WB_MANIFEST が差し込まれる
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// =============== 共通ヘルパ ===============
const normalizePath = (urlString) => {
  try {
    const u = new URL(urlString);
    return (u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
};

// =============== 前面状態（メモリ + 永続化） ===============
let foregroundState = {
  path: "/",
  visible: false,
  focused: false,
  ts: 0,
};

// ★ iOS の挙動に合わせて “短い” TTL（ここが長いと抑制が崩れる）
//   マッチ通知で“非前面”直後の抑制漏れを避けるため、より短く設定
const STATE_TTL_MS = 5 * 1000;
const isFresh = (ts) => Date.now() - ts < STATE_TTL_MS;

const PERSIST_CACHE = "fg-state-v1";
const PERSIST_URL = "/__fg_state__";

async function saveForegroundStatePersistent(state) {
  try {
    const cache = await caches.open(PERSIST_CACHE);
    const res = new Response(JSON.stringify(state), {
      headers: { "content-type": "application/json" },
    });
    await cache.put(PERSIST_URL, res);
  } catch {
    /* noop */
  }
}
async function readForegroundStatePersistent() {
  try {
    const cache = await caches.open(PERSIST_CACHE);
    const res = await cache.match(PERSIST_URL);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ページからの状態メッセージ（postMessage）
self.addEventListener("message", (event) => {
  const data = event.data || {};
  // 画面前面の心拍
  if (data.type === "FOREGROUND_STATE") {
    foregroundState = {
      path: normalizePath(data.path || "/"),
      visible: !!data.visible,
      focused: !!data.focused,
      ts: Date.now(),
    };
    event.waitUntil(saveForegroundStatePersistent(foregroundState));
  }

  // バッジ操作（アプリ側からの即時同期）
  if (data.type === "BADGE_SET") {
    const n = Math.max(0, data.count | 0);
    event.waitUntil(setAndPersistBadge(n));
  }
  if (data.type === "BADGE_DECREMENT") {
    const d = Math.max(0, data.delta | 0);
    if (d > 0) event.waitUntil(adjustBadge(-d));
  }
});

// 送信用フォールバック（sendBeacon / fetch 経由）
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // 前面状態のフォールバック送信口
  // 開発環境ではService Workerが無効なので、この処理は実行されない
  if (event.request.method === "POST" && url.pathname === "/api/sw/fg") {
    event.respondWith(
      (async () => {
        try {
          const data = await event.request.json();
          if (data && data.type === "FOREGROUND_STATE") {
            foregroundState = {
              path: normalizePath(data.path || "/"),
              visible: !!data.visible,
              focused: !!data.focused,
              ts: Date.now(),
            };
            await saveForegroundStatePersistent(foregroundState);
          }
        } catch {
          /* noop */
        }
        return new Response(null, { status: 204 });
      })()
    );
  }
});

// =============== バッジ（未読件数）の保持・更新 ===============
const BADGE_CACHE = "badge-store-v1";
const BADGE_URL = "/__badge__";

async function readBadge() {
  try {
    const c = await caches.open(BADGE_CACHE);
    const res = await c.match(BADGE_URL);
    if (!res) return 0;
    const { count } = await res.json();
    return Math.max(0, count | 0);
  } catch {
    return 0;
  }
}

async function writeBadge(n) {
  try {
    const c = await caches.open(BADGE_CACHE);
    const res = new Response(JSON.stringify({ count: Math.max(0, n | 0) }), {
      headers: { "content-type": "application/json" },
    });
    await c.put(BADGE_URL, res);
  } catch {
    /* noop */
  }
}

async function applyOSBadge(n) {
  try {
    // Chromium: self.registration.setAppBadge /  Safari: ない場合もあるが try/catch で握りつぶす
    if (typeof self.registration.setAppBadge === "function") {
      await self.registration.setAppBadge(Math.max(0, n | 0));
    }
  } catch {
    /* noop */
  }
}

async function setAndPersistBadge(n) {
  await writeBadge(n);
  await applyOSBadge(n);
}

async function adjustBadge(delta) {
  const cur = await readBadge();
  const next = Math.max(0, cur + (delta | 0));
  await setAndPersistBadge(next);
}

// =============== 通知クリア ヘルパ ===============
async function clearAllNotifications() {
  try {
    const notifs = await self.registration.getNotifications({
      includeTriggered: true,
    });
    for (const n of notifs) n.close();
  } catch {
    /* noop */
  }
}

async function clearNotificationsAndBadge() {
  await clearAllNotifications();
  await setAndPersistBadge(0);
}

// =============== push ===============
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {}

  const {
    type, // "message" | "match" | "sent_message" | "digest_user" | "digest_global" など
    chatId,
    title = "通知",
    body = "",
    // 任意: サーバが与える増分（無ければ 1）
    badgeDelta,
    // 任意: 同じダイジェストの重複抑止に使える識別子（あれば tag に反映）
    digestKey,
    senderId, // sent_message 用
  } = payload;

  event.waitUntil(
    (async () => {
      // 1) 現在開いているクライアント一覧（iOS の可視判定は信用しない）
      const wins = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 2) 永続化された最新の前面状態（SW の再起動にも耐える）
      const persisted = await readForegroundStatePersistent();
      const isActiveByHeartbeat =
        !!persisted &&
        isFresh(persisted.ts) &&
        (persisted.visible || persisted.focused);

      // 3) まずバッジ更新（アプリが起動していなくても増える）
      //    - メッセージ系だけを未読としてカウント（digest はカウントしない）
      if (type === "message" || type === "sent_message") {
        const inc = Number.isFinite(badgeDelta) ? badgeDelta | 0 : 1;
        await adjustBadge(+inc);
      }

      // 4) 抑制判定
      const isDigest = type === "digest_user" || type === "digest_global";
      // ダイジェストは常に表示（抑制しない）
      // チャットメッセージとsent_messageは抑制しない（ユーザー要望）
      let suppress = false;
      if (!isDigest) {
        // match は抑制を弱める：フォーカスかつ可視の"確実な前面"のみ抑制
        // これにより非前面直後（心拍の残留）でも OS 通知を表示できる
        if (type === "match") {
          const visible = !!(persisted && persisted.visible);
          const focused = !!(persisted && persisted.focused);
          suppress =
            wins.length > 0 &&
            isFresh(persisted?.ts || 0) &&
            visible &&
            focused;
        }
        // message と sent_message は抑制しない
        // その他タイプは既定（抑制なし）
      }

      if (suppress) return;

      // 5) 通知表示
      const tagBase = isDigest
        ? `digest:${digestKey || ""}:${type}` // digest はまとまるように
        : type === "sent_message"
        ? `sent_message:${senderId ?? ""}` // sent_message 用のタグ
        : `${type}:${chatId ?? ""}`; // 既存の tag を踏襲
      
      // リアルタイム通知（message, sent_message, match）には文言を追加
      const isRealtimeNotification = type === "message" || type === "sent_message" || type === "match";
      const notificationBody = isRealtimeNotification
        ? `${body}\n\nリアルタイム通知\n（この通知はフェイクではありません）`
        : body;
      
      return self.registration.showNotification(title, {
        body: notificationBody,
        tag: tagBase,
        data: payload,
        // badge: '/icons/badge.png', // 必要なら用意
      });
    })()
  );
});

// =============== click ===============
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  const targetUrl =
    // digest は利用導線としてチャット一覧へ（必要なら '/main' 等に変更可）
    type === "digest_user" || type === "digest_global"
      ? "/main"
      : type === "match"
      ? "/main"
      : type === "sent_message"
      ? "/main" // sent_message は /main に遷移
      : chatId
      ? `/chat/${chatId}`
      : matchId
      ? `/chat/${matchId}`
      : "/chat-list";

  event.waitUntil(
    (async () => {
      // 自動クリアを無効化: await clearNotificationsAndBadge();
      const wins = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const targetPath = normalizePath(targetUrl);
      for (const w of wins) {
        if (normalizePath(w.url) === targetPath) return w.focus();
      }
      return clients.openWindow(targetUrl);
    })()
  );
});

// =============== 前面化時の通知クリア ===============
// 自動クリアを無効化
// self.addEventListener("message", (event) => {
//   const data = event.data || {};
//   if (data.type === "FOREGROUND_STATE") {
//     event.waitUntil(
//       (async () => {
//         if (data.visible || data.focused) {
//           await clearNotificationsAndBadge();
//         }
//       })()
//     );
//   }
// });
