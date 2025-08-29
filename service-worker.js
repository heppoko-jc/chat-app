/* service-worker.js */
/* global self, clients */
// Workbox を CDN から読み込む（元のまま）
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// 念のため：新 SW を即時適用
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// __WB_MANIFEST は InjectManifest によりビルド時に注入される
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// ------- Push 受信 -------
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // JSON でない場合に備える
    try { payload = JSON.parse(event.data.text()); } catch {}
  }

  const { type, chatId, title = '通知', body = '' } = payload;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      // チャット通知の場合、該当チャットが "可視状態" なら OS 通知は抑制
      const inChat =
        type === 'message' &&
        typeof chatId === 'string' &&
        winClients.some((c) => c.url.includes(`/chat/${chatId}`) && c.visibilityState === 'visible');

      if (inChat) return;

      return self.registration.showNotification(title, {
        body,
        tag: type + (chatId || ''),
        data: payload, // 後で click で使う
      });
    })
  );
});

// ------- 通知クリック -------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // ★修正点：
  //   これまで `matchId` しか見ておらず、message 通知で /chat/undefined になることがあった。
  //   → message なら chatId を、match なら notifications へ。
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  // match 通知：履歴画面へ
  // message 通知：/chat/{chatId} へ（旧互換として matchId もフォールバック）
  const targetUrl = type === 'match' ? '/notifications' : `/chat/${chatId ?? matchId ?? ''}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      for (const client of winClients) {
        if (client.url.includes(targetUrl)) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});