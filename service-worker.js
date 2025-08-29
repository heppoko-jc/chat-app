/* service-worker.js */
/* global self, clients */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// 新SWを即時適用 & 既存クライアント制御
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// __WB_MANIFEST は InjectManifest でビルド時に注入
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// -------- Push 受信 --------
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = event.data ? JSON.parse(event.data.text()) : {};
    } catch {}
  }

  const { type, chatId, title = '通知', body = '' } = payload || {};

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      // チャット通知: そのチャットが前面なら OS 通知は抑制
      const shouldSuppress =
        type === 'message' &&
        typeof chatId === 'string' &&
        winClients.some((c) => c.visibilityState === 'visible' && c.url.includes(`/chat/${chatId}`));

      if (shouldSuppress) return;

      return self.registration.showNotification(title, {
        body,
        tag: `${type || 'notify'}:${chatId || ''}`, // 端末側でまとめる用
        data: payload, // クリック時に利用
      });
    })
  );
});

// -------- 通知クリック --------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const { type, chatId, matchId } = data;

  // 行き先のパスを決定（message → /chat/{chatId}, match → /notifications）
  let path;
  if (type === 'match') {
    path = '/notifications';
  } else {
    // 旧実装の互換として matchId をフォールバック、どちらも無ければ一覧へ
    const id = chatId ?? matchId;
    path = id ? `/chat/${encodeURIComponent(String(id))}` : '/chat-list';
  }

  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winClients) => {
      // 同一オリジンのタブに限定
      const sameOrigin = winClients.filter((c) => new URL(c.url).origin === self.location.origin);

      // 既に目的の画面があればフォーカス
      for (const client of sameOrigin) {
        if (client.url.includes(path)) {
          return client.focus();
        }
      }

      // 無ければ新規で開く（必ず絶対URLで）
      return clients.openWindow(targetUrl);
    })
  );
});