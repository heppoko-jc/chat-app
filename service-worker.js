/* service-worker.js */
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
    return (u.pathname || '/').replace(/\/+$/, '') || '/'; // 末尾スラッシュ削除
  } catch {
    return '/';
  }
};

// iOS/Android PWA 向け：ページ側から送ってもらう状態をキャッシュ
let foregroundState = {
  path: '/',      // 例: '/chat/xxx', '/chat-list', '/notifications'
  visible: false, // 参考値（iOS PWA では不正確なことがある）
  ts: 0,          // 最終更新時刻
};
const STATE_TTL = 120 * 1000; // 120秒を新鮮とみなす

const isStateFresh = () => Date.now() - foregroundState.ts < STATE_TTL;

// ページからの状態メッセージを受け取る
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'FOREGROUND_STATE') {
    foregroundState = {
      path: normalizePath(data.path || '/'),
      visible: !!data.visible,
      ts: Date.now(),
    };
  }
});

// ------------ push ------------
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}

  const {
    type,           // "message" | "match" 等
    chatId,         // 紐づくチャットID（可能なら常に付与）
    title = '通知',
    body = '',
  } = payload;

  event.waitUntil(
    (async () => {
      // 従来の可視クライアント検出（Chrome などでは信頼できる）
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visibleClients = wins
        .map((c) => ({
          c,
          path: normalizePath(c.url),
          visible: 'visibilityState' in c ? c.visibilityState === 'visible' : false,
        }))
        .filter((w) => w.visible);

      const anyVisibleChat = (typeof chatId === 'string' && chatId)
        ? visibleClients.some(({ path }) => path === `/chat/${chatId}`)
        : false;
      const anyVisibleList = visibleClients.some(({ path }) => path === '/chat-list');

      // iOS/Android PWA のフォールバック（visible は信用しないで path だけ見る）
      const stateFresh  = isStateFresh();
      const stateIsChat = stateFresh && (typeof chatId === 'string' && chatId) && (foregroundState.path === `/chat/${chatId}`);
      const stateIsList = stateFresh && (foregroundState.path === '/chat-list');

      let suppress = false;

      if (type === 'message') {
        // 対象チャット or チャットリストが “表示中 or 直近で前面” なら抑制
        suppress = anyVisibleChat || anyVisibleList || stateIsChat || stateIsList;
      } else if (type === 'match') {
        // マッチは常に通知（抑制したいなら上と同様の条件を足す）
        suppress = false;
      } else {
        suppress = false;
      }

      if (suppress) return;
      return self.registration.showNotification(title, {
        body,
        tag: `${type}:${chatId ?? ''}`,
        data: payload,
      });
    })()
  );
});

// ------------ click ------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  const targetUrl =
    type === 'match'
      ? '/notifications'
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