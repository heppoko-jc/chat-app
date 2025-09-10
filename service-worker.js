/* global self, clients */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

// Workbox InjectManifest：ビルド時に __WB_MANIFEST が差し込まれる
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// =============== 共通ヘルパ ===============
const normalizePath = (urlString) => {
  try {
    const u = new URL(urlString);
    return (u.pathname || '/').replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
};

// =============== 前面状態（メモリ + 永続化） ===============
let foregroundState = {
  path: '/',
  visible: false,
  focused: false,
  ts: 0,
};

// ★ iOS の挙動に合わせて “短い” TTL（ここが長いと抑制が崩れる）
const STATE_TTL_MS = 15 * 1000;
const isFresh = (ts) => Date.now() - ts < STATE_TTL_MS;

const PERSIST_CACHE = 'fg-state-v1';
const PERSIST_URL   = '/__fg_state__';

async function saveForegroundStatePersistent(state) {
  try {
    const cache = await caches.open(PERSIST_CACHE);
    const res = new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } });
    await cache.put(PERSIST_URL, res);
  } catch { /* noop */ }
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
self.addEventListener('message', (event) => {
  const data = event.data || {};
  // 画面前面の心拍
  if (data.type === 'FOREGROUND_STATE') {
    foregroundState = {
      path: normalizePath(data.path || '/'),
      visible: !!data.visible,
      focused: !!data.focused,
      ts: Date.now(),
    };
    event.waitUntil(saveForegroundStatePersistent(foregroundState));
  }

  // バッジ操作（アプリ側からの即時同期）
  if (data.type === 'BADGE_SET') {
    const n = Math.max(0, (data.count|0));
    event.waitUntil(setAndPersistBadge(n));
  }
  if (data.type === 'BADGE_DECREMENT') {
    const d = Math.max(0, (data.delta|0));
    if (d > 0) event.waitUntil(adjustBadge(-d));
  }
});

// 送信用フォールバック（sendBeacon / fetch 経由）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 前面状態のフォールバック送信口
  if (event.request.method === 'POST' && url.pathname === '/__sw/fg') {
    event.respondWith((async () => {
      try {
        const data = await event.request.json();
        if (data && data.type === 'FOREGROUND_STATE') {
          foregroundState = {
            path: normalizePath(data.path || '/'),
            visible: !!data.visible,
            focused: !!data.focused,
            ts: Date.now(),
          };
          await saveForegroundStatePersistent(foregroundState);
        }
      } catch { /* noop */ }
      return new Response(null, { status: 204 });
    })());
  }
});

// =============== バッジ（未読件数）の保持・更新 ===============
const BADGE_CACHE = 'badge-store-v1';
const BADGE_URL   = '/__badge__';

async function readBadge() {
  try {
    const c = await caches.open(BADGE_CACHE);
    const res = await c.match(BADGE_URL);
    if (!res) return 0;
    const { count } = await res.json();
    return Math.max(0, count|0);
  } catch {
    return 0;
  }
}

async function writeBadge(n) {
  try {
    const c = await caches.open(BADGE_CACHE);
    const res = new Response(JSON.stringify({ count: Math.max(0, n|0) }), {
      headers: { 'content-type': 'application/json' }
    });
    await c.put(BADGE_URL, res);
  } catch { /* noop */ }
}

async function applyOSBadge(n) {
  try {
    // Chromium: self.registration.setAppBadge /  Safari: ない場合もあるが try/catch で握りつぶす
    if (typeof self.registration.setAppBadge === 'function') {
      await self.registration.setAppBadge(Math.max(0, n|0));
    }
  } catch { /* noop */ }
}

async function setAndPersistBadge(n) {
  await writeBadge(n);
  await applyOSBadge(n);
}

async function adjustBadge(delta) {
  const cur = await readBadge();
  const next = Math.max(0, cur + (delta|0));
  await setAndPersistBadge(next);
}

// =============== push ===============
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}

  const {
    type,                 // "message" | "match" など
    chatId,
    title = '通知',
    body  = '',
    // 任意: サーバが与える増分（無ければ 1）
    badgeDelta,
  } = payload;

  event.waitUntil((async () => {
    // 1) 現在開いているクライアント一覧（iOS の可視判定は信用しない）
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 2) 永続化された最新の前面状態（SW の再起動にも耐える）
    const persisted = await readForegroundStatePersistent();
    const isActiveByHeartbeat = !!persisted && isFresh(persisted.ts) && (persisted.visible || persisted.focused);

    // 3) まずバッジ更新（アプリが起動していなくても増える）
    //    - メッセージ系だけを未読としてカウント（必要なら type で条件調整）
    if (type === 'message') {
      const inc = Number.isFinite(badgeDelta) ? (badgeDelta|0) : 1;
      await adjustBadge(+inc);
    }

    // 4) 抑制判定：アプリが「直近 15s 以内に前面」であれば通知は出さない
    const suppress = isActiveByHeartbeat || (wins.length > 0 && isActiveByHeartbeat);

    if (suppress) return;

    // 5) 非アクティブ時のみ通知表示
    return self.registration.showNotification(title, {
      body,
      tag: `${type}:${chatId ?? ''}`,
      data: payload,
      // badge オプションは一部環境のみ（無くても害はない）
      // badge: '/icons/badge.png',
    });
  })());
});

// =============== click ===============
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  const targetUrl =
    type === 'match'
      ? '/main'
      : (chatId ? `/chat/${chatId}` : (matchId ? `/chat/${matchId}` : '/chat-list'));

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const targetPath = normalizePath(targetUrl);
      for (const w of wins) {
        if (normalizePath(w.url) === targetPath) return w.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});