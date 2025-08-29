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

// iOS PWA で matchAll/visibility が取れないことがあるため、
// ページ側から送ってもらうフロントの状態を SW 内にキャッシュする。
let foregroundState = {
  path: '/',      // 例: '/chat/xxx', '/chat-list', '/notifications'
  visible: false, // true: 画面が可視
  ts: 0,          // 最終更新時刻
};
const STATE_TTL = 30 * 1000; // 30秒を新鮮とみなす

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
      // まずは従来の可視クライアント検出（Safariで取れない場合がある）
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visibleClients = wins
        .map((c) => ({ c, path: normalizePath(c.url), visible: 'visibilityState' in c ? c.visibilityState === 'visible' : false }))
        .filter((w) => w.visible);

      const anyVisibleChat   = typeof chatId === 'string' && chatId && visibleClients.some(({ path }) => path === `/chat/${chatId}`);
      const anyVisibleList   = visibleClients.some(({ path }) => path === '/chat-list');
      const anyVisibleNotifs = visibleClients.some(({ path }) => path === '/notifications');

      // 次に、ページからの“ハートビート状態”で補完（iOS PWA の主目的）
      const stateVisible = isStateFresh() && foregroundState.visible;
      const stateIsChat  = stateVisible && (typeof chatId === 'string' && chatId) && (foregroundState.path === `/chat/${chatId}`);
      const stateIsList  = stateVisible && (foregroundState.path === '/chat-list');
      const stateIsNotifs= stateVisible && (foregroundState.path === '/notifications');

      let suppress = false;
      if (type === 'message') {
        // 対象チャット or チャットリストが見えていれば抑制
        suppress = anyVisibleChat || anyVisibleList || stateIsChat || stateIsList;
      } else if (type === 'match') {
        // 対象チャット / チャットリスト / 通知一覧 いずれか可視なら抑制
        // （通知を必ず見せたいなら stateIsNotifs/anyVisibleNotifs は外す）
        suppress = anyVisibleChat || anyVisibleList || anyVisibleNotifs || stateIsChat || stateIsList || stateIsNotifs;
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