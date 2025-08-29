/* service-worker.js */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const { type, chatId, title = '通知', body = '' } = payload;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      // 可視の対象チャット or 可視のチャットリストなら通知を抑止
      const suppress = winClients.some((c) => {
        const visible = 'visibilityState' in c ? c.visibilityState === 'visible' : true;
        if (!visible) return false;
        const u = c.url || '';
        const onThisChat = typeof chatId === 'string' && u.includes(`/chat/${chatId}`);
        const onChatList = /\/chat-list(?:[?#]|$)/.test(u);
        return onThisChat || onChatList;
      });

      if (suppress) return;
      return self.registration.showNotification(title, {
        body,
        tag: type + (chatId || ''),
        data: payload,
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;
  const targetUrl = type === 'match' ? '/notifications' : `/chat/${chatId ?? matchId ?? ''}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      for (const client of winClients) {
        if (client.url.includes(targetUrl)) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});