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

// =============== ページルートのフォールバック戦略 ===============
// プリキャッシュに含まれていないページ（/mainなど）へのアクセス時、
// ネットワークファースト戦略を使用（ネットワーク優先、失敗時のみキャッシュ）
// これにより、常に最新のページを取得しようとし、404エラーを防ぐ
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({
    cacheName: "pages-cache",
    plugins: [
      {
        cacheKeyWillBeUsed: async ({ request }) => {
          // リクエストURLをそのままキャッシュキーとして使用
          return request.url;
        },
      },
    ],
  })
);

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
  if (event.request.method === "POST" && url.pathname === "/__sw/fg") {
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
    type, // "message" | "match" | "digest_user" | "digest_global" など
    chatId,
    title = "通知",
    body = "",
    // 任意: サーバが与える増分（無ければ 1）
    badgeDelta,
    // 任意: 同じダイジェストの重複抑止に使える識別子（あれば tag に反映）
    digestKey,
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
      if (type === "message") {
        const inc = Number.isFinite(badgeDelta) ? badgeDelta | 0 : 1;
        await adjustBadge(+inc);
      }

      // 4) 抑制判定
      const isDigest = type === "digest_user" || type === "digest_global";
      // ダイジェストは常に表示（抑制しない）
      let suppress = false;
      if (!isDigest) {
        // message は「前面相当なら抑制」（従来どおり）
        if (type === "message") {
          suppress = !!isActiveByHeartbeat;
        }
        // match は抑制を弱める：フォーカスかつ可視の“確実な前面”のみ抑制
        // これにより非前面直後（心拍の残留）でも OS 通知を表示できる
        else if (type === "match") {
          const visible = !!(persisted && persisted.visible);
          const focused = !!(persisted && persisted.focused);
          suppress =
            wins.length > 0 &&
            isFresh(persisted?.ts || 0) &&
            visible &&
            focused;
        }
        // その他タイプは既定（抑制なし）
      }

      if (suppress) return;

      // 5) 通知表示
      const tagBase = isDigest
        ? `digest:${digestKey || ""}:${type}` // digest はまとまるように
        : `${type}:${chatId ?? ""}`; // 既存の tag を踏襲
      return self.registration.showNotification(title, {
        body,
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
  const { type, matchId, chatId, matchedUserId, matchedUserName, body } = data;

  const targetUrl =
    // digest は利用導線としてチャット一覧へ（必要なら '/main' 等に変更可）
    type === "digest_user" || type === "digest_global"
      ? "/main"
      : type === "match"
      ? "/main"
      : chatId
      ? `/chat/${chatId}`
      : matchId
      ? `/chat/${matchId}`
      : "/chat-list";

  event.waitUntil(
    (async () => {
      // マッチ通知の場合、通知データをlocalStorageに保存（ポップアップ表示用）
      if (type === "match" && matchedUserId && matchedUserName && body) {
        try {
          // 全ウィンドウに通知データを送信してlocalStorageに保存
          const wins = await clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          const notificationData = {
            type: "match",
            matchedUserId,
            matchedUserName,
            message: body.match(/「([^」]+)」/)
              ? body.match(/「([^」]+)」/)[1]
              : body,
            chatId: chatId || matchId,
            timestamp: Date.now(),
          };

          for (const win of wins) {
            win.postMessage({
              type: "PENDING_NOTIFICATION",
              data: notificationData,
            });
          }

          // 新しいウィンドウを開く前に設定（開いた後に適用される）
          // ただし、既存のウィンドウがある場合はそちらを使う
          const targetPath = normalizePath(targetUrl);
          for (const w of wins) {
            if (normalizePath(w.url) === targetPath) {
              // データ送信後にフォーカス
              return w.focus();
            }
          }

          // 新しいウィンドウを開く
          const newWin = await clients.openWindow(targetUrl);
          if (newWin) {
            // 新しいウィンドウが開かれたら、少し待ってからデータを送信
            setTimeout(() => {
              newWin.postMessage({
                type: "PENDING_NOTIFICATION",
                data: notificationData,
              });
            }, 100);
          }
          return newWin;
        } catch (e) {
          console.error("通知データの保存エラー:", e);
        }
      } else {
        // マッチ通知以外は通常の処理
        const wins = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const targetPath = normalizePath(targetUrl);
        for (const w of wins) {
          if (normalizePath(w.url) === targetPath) return w.focus();
        }
        return clients.openWindow(targetUrl);
      }
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
