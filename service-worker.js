/* global self, clients */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await clients.claim();
    // 起動時に保存済みバッジを復元
    const c = await readBadgeFromCache();
    badgeCount = c;
    try { await self.registration.setAppBadge?.(badgeCount); } catch {}
  })());
});

// Workbox InjectManifest
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// ---------- 共有ヘルパ ----------
const normalizePath = (urlString) => {
  try {
    const u = new URL(urlString);
    return (u.pathname || '/').replace(/\/+$/, '') || '/';
  } catch { return '/'; }
};

// フロントからの“前面状態”
let foregroundState = { path: '/', visible: false, focused: false, ts: 0 };
const STATE_TTL = 120 * 1000;
const isStateFresh = () => Date.now() - foregroundState.ts < STATE_TTL;

// ★ バッジカウント（SW内に保持し、CacheStorageにも保存）
let badgeCount = 0;
const BADGE_CACHE = 'app-badge';
const BADGE_URL   = '/__badge__';

async function readBadgeFromCache() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const res = await cache.match(BADGE_URL);
    if (!res) return 0;
    const data = await res.json();
    return data?.count | 0;
  } catch { return 0; }
}
async function writeBadgeToCache(n) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(BADGE_URL, new Response(JSON.stringify({ count: n }), {
      headers: { 'content-type': 'application/json' }
    }));
  } catch {}
}
async function setBadge(n) {
  badgeCount = Math.max(0, n | 0);
  try { await self.registration.setAppBadge?.(badgeCount); } catch {}
  await writeBadgeToCache(badgeCount);
}
async function incBadge(delta = 1) { await setBadge(badgeCount + (delta | 0)); }

// ---------- フロントからの message ----------
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'FOREGROUND_STATE') {
    foregroundState = {
      path: normalizePath(data.path || '/'),
      visible: !!data.visible,
      focused: !!data.focused,
      ts: Date.now(),
    };
  } else if (data.type === 'BADGE_SET') {
    event.waitUntil(setBadge(data.count | 0));
  } else if (data.type === 'BADGE_DECREMENT') {
    const d = Math.max(0, data.delta | 0);
    event.waitUntil(setBadge(badgeCount - d));
  }
});

// ---------- iOS対策：/__sw/fg への sendBeacon/keepalive fetch も受ける ----------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/__sw/fg' && event.request.method === 'POST') {
    event.respondWith((async () => {
      let body = {};
      try { body = await event.request.json(); } catch {}
      if (body?.type === 'FOREGROUND_STATE') {
        foregroundState = {
          path: normalizePath(body.path || '/'),
          visible: !!body.visible,
          focused: !!body.focused,
          ts: Date.now(),
        };
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' }
      });
    })());
  }
});

// ---------- push ----------
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}

  const { type, chatId, title = '通知', body = '', unreadTotal } = payload;

  event.waitUntil((async () => {
    // “アプリがアクティブなら通知抑制”
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const anyVisibleWindow = wins.some((c) => {
      try { return 'visibilityState' in c && c.visibilityState === 'visible'; } catch { return false; }
    });
    const freshActive = isStateFresh() && (foregroundState.visible || foregroundState.focused);

    // バッジはアクティブでも加算（= 未読として積む）
    if (typeof unreadTotal === 'number') {
      await setBadge(unreadTotal | 0);
    } else if (type === 'message') {
      await incBadge(1);
    }

    if (anyVisibleWindow || freshActive) {
      // 通知は出さない（抑制）
      return;
    }

    return self.registration.showNotification(title, {
      body,
      tag: `${type}:${chatId ?? ''}`,
      data: payload,
    });
  })());
});

// ---------- click ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  const targetUrl =
    type === 'match'
      ? '/main'
      : (chatId ? `/chat/${chatId}` : (matchId ? `/chat/${matchId}` : '/chat-list'));

  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const targetPath = normalizePath(targetUrl);
    for (const w of wins) {
      if (normalizePath(w.url) === targetPath) return w.focus();
    }
    return clients.openWindow(targetUrl);
  }));
});