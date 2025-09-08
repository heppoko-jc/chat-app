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
    return (u.pathname || '/').replace(/\/+$/, '') || '/'; // 末尾スラッシュ削除
  } catch {
    return '/';
  }
};

// アプリ前面状態（ページ側のピンガーが送ってくる）
let foregroundState = {
  path: '/',          // 例: '/chat/xxx', '/chat-list', '/notifications' など
  visible: false,     // document.visibilityState === 'visible'
  focused: false,     // document.hasFocus()
  ts: 0,              // 最終更新時刻
};
const STATE_TTL = 120 * 1000; // 120秒以内なら“新鮮”とみなす

const isStateFresh = () => Date.now() - foregroundState.ts < STATE_TTL;

// ページからの状態メッセージを受け取る
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'FOREGROUND_STATE') {
    foregroundState = {
      path: normalizePath(data.path || '/'),
      visible: !!data.visible,
      focused: !!data.focused,           // ★ 追加：フォーカスも保存
      ts: Date.now(),
    };
  }
});

// ------------ push ------------
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}

  const {
    type,           // "message" | "match" など（今回の抑制では区別しない）
    chatId,         // 紐づくチャットID（可能なら常に付与）
    title = '通知',
    body = '',
  } = payload;

  event.waitUntil(
    (async () => {
      // 1) 現在開いているクライアント一覧
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });

      // 1-A) ブラウザが可視状態を返せる場合（Chrome など）
      const anyVisibleWindow = wins.some((c) => {
        // visibilityState は 'hidden' | 'visible' | など
        try {
          return 'visibilityState' in c && c.visibilityState === 'visible';
        } catch {
          return false;
        }
      });

      // 2) ページ側心拍（5s）で直近120s以内かつ、visible or focused が true
      const freshActive = isStateFresh() && (foregroundState.visible || foregroundState.focused);

      // === ここが今回の“アプリがアクティブなら抑制”の中核 ===
      // 画面種類やパスに関係なく、前面ならすべて抑制（message / match を問わない）
      if (anyVisibleWindow || freshActive) {
        return; // 抑制：通知を出さない
      }

      // 非アクティブ時のみ通知を表示
      return self.registration.showNotification(title, {
        body,
        tag: `${type}:${chatId ?? ''}`,  // OS側で重複通知を束ねられるように
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