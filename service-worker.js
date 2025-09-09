// service-worker.js
/* global self, clients */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

// Workbox InjectManifest：ビルド時に __WB_MANIFEST が差し込まれる
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// ------------ 共有ヘルパ ------------
const normalizePath = (urlString) => {
  try {
    const u = new URL(urlString);
    return (u.pathname || '/').replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
};

// ===== 前面状態（メモリ + 永続化） =====
let foregroundState = {
  path: '/',
  visible: false,
  focused: false,
  ts: 0,
};

const STATE_TTL_MS = 15 * 1000;               // ★ iOS 向けに短めの TTL（15s）
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
  if (data.type === 'FOREGROUND_STATE') {
    foregroundState = {
      path: normalizePath(data.path || '/'),
      visible: !!data.visible,
      focused: !!data.focused,
      ts: Date.now(),
    };
    // 永続化（SW が落ちても push 時に読める）
    event.waitUntil(saveForegroundStatePersistent(foregroundState));
  }
});

// ページからの状態送信（sendBeacon/Fetch フォールバック）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
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

// ------------ push ------------
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}

  const {
    type,                 // "message" | "match" など
    chatId,
    title = '通知',
    body = '',
  } = payload;

  event.waitUntil((async () => {
    // 1) 現在開いているクライアント一覧（可視判定は iOS では信用しない）
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    // 2) 永続化された最新の前面状態を読む（SW リスタートに耐える）
    const persisted = await readForegroundStatePersistent();
    const activeByHeartbeat =
      !!persisted && isFresh(persisted.ts) && (persisted.visible || persisted.focused);

    // 3) 抑制判定：アプリがアクティブなら出さない
    //    - wins.length>0 は「ページが開いている」程度の参考値（iOSは hidden になることがある）
    const suppress = activeByHeartbeat || wins.length > 0 && activeByHeartbeat;

    if (suppress) return;

    // 非アクティブ時のみ通知を出す
    return self.registration.showNotification(title, {
      body,
      tag: `${type}:${chatId ?? ''}`,
      data: payload,
    });
  })());
});

// ------------ click ------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  const targetUrl =
    type === 'match'
      ? '/main'                                  // ← マッチはメインへ
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