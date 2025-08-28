/* service-worker.js */
/* global self, clients */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// プッシュ受信時のハンドラ
self.addEventListener('push', event => {
  const payload = event.data.json();
  console.log('[SW] push payload:', payload);
  const { type, chatId, title, body } = payload;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(winClients => {
      // チャット通知の場合、該当チャット画面が開いていれば抑制
      const inChat = winClients.some(c =>
        type === 'message' &&
        c.url.includes(`/chat/${chatId}`) &&
        c.visibilityState === 'visible'
      );
      if (inChat) return;   // 開いていれば通知しない

      // 通知を表示
      return self.registration.showNotification(title, {
        body,
        tag: type + (chatId || ''),
        data: payload,
      });
    })
  );
});

// 通知クリック時のハンドラ
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { type, matchId } = event.notification.data;
  const targetUrl = type === 'match' ? '/notifications' : `/chat/${matchId}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(winClients => {
      // すでに開いているタブがあればフォーカス
      for (const client of winClients) {
        if (client.url.includes(targetUrl)) {
          return client.focus();
        }
      }
      // なければ新規ウィンドウを開く
      return clients.openWindow(targetUrl);
    })
  );
});