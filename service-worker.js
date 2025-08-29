/* service-worker.js */
/* global self, clients */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

// InjectManifest
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// ---- push ----
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}

  const { type, chatId, title = '通知', body = '' } = payload;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      let suppress = false;

      if (type === 'message' && typeof chatId === 'string' && chatId) {
        // 「可視」の /chat/{chatId} または /chat-list に限り抑制
        suppress = winClients.some((c) => {
          // WindowClient だけ visibilityState を持つ
          const visible = 'visibilityState' in c ? c.visibilityState === 'visible' : false;
          if (!visible) return false;

          try {
            const u = new URL(c.url);
            const p = u.pathname.replace(/\/+$/, ''); // 末尾スラッシュ除去
            return p === `/chat/${chatId}` || p === '/chat-list';
          } catch {
            return false;
          }
        });
      }

      if (suppress) return;
      return self.registration.showNotification(title, {
        body,
        tag: `${type}:${chatId ?? ''}`,
        data: payload,
      });
    })
  );
});

// ---- click ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  const targetUrl = type === 'match'
    ? '/notifications'
    : (chatId ? `/chat/${chatId}` : (matchId ? `/chat/${matchId}` : '/chat-list'));

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      for (const client of winClients) {
        if (client.url.includes(targetUrl)) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});