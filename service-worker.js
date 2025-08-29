/* service-worker.js */
/* global self, clients */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

// Workbox InjectManifest：ビルド時に __WB_MANIFEST が差し込まれる
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// --------- 共通ヘルパ ----------
const normalizePath = (urlString) => {
  try {
    const u = new URL(urlString);
    // クエリ・ハッシュ・末尾スラッシュ除去
    return u.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
};
const isClientVisible = (c) => {
  // visibilityState があればそれを使い、無ければ focused を見る（Safari 対策）
  if ('visibilityState' in c) return c.visibilityState === 'visible';
  if ('focused' in c) return !!c.focused;
  // 分からない場合は「不可視扱い」にしておく（誤抑制を避ける）
  return false;
};

// --------- push ----------
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}

  const {
    type,           // "message" | "match" など
    chatId,         // メッセージ/マッチに紐づくチャットID（可能なら付ける）
    title = '通知',
    body = '',
  } = payload;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // 現在可視のページ群
      const visibleClients = wins.filter(isClientVisible).map((c) => ({ c, path: normalizePath(c.url) }));

      // --- 抑制条件 ---
      // 1) 該当チャットを開いているとき（/chat/{chatId}）
      const isInTargetChat =
        typeof chatId === 'string' && chatId &&
        visibleClients.some(({ path }) => path === `/chat/${chatId}`);

      // 2) チャットリストを開いているとき（/chat-list）
      const isInChatList =
        visibleClients.some(({ path }) => path === '/chat-list');

      // 3) 通知一覧を開いているとき（/notifications）… match のときはこれでも抑制したいなら true に
      const isInNotifications =
        visibleClients.some(({ path }) => path === '/notifications');

      let suppress = false;
      if (type === 'message') {
        // メッセージ系：対象チャット or チャットリストが見えていれば抑制
        suppress = isInTargetChat || isInChatList;
      } else if (type === 'match') {
        // マッチ系：対象チャット or チャットリスト or 通知一覧が見えていれば抑制
        // （通知を必ず見せたいなら isInNotifications は条件から外してください）
        suppress = (isInTargetChat || isInChatList || isInNotifications);
      } else {
        // その他タイプ：必要ならここで条件を追加
        suppress = false;
      }

      if (suppress) return; // 表示しない

      return self.registration.showNotification(title, {
        body,
        tag: `${type}:${chatId ?? ''}`, // 既読系ブラウザがまとめてくれる
        data: payload,                  // click で使う
      });
    })
  );
});

// --------- click ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const { type, matchId, chatId } = data;

  // クリック遷移の優先順位
  const targetUrl =
    type === 'match'
      ? '/notifications'
      : (chatId ? `/chat/${chatId}` : (matchId ? `/chat/${matchId}` : '/chat-list'));

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const targetPath = targetUrl; // すでに正規化済みパス
      for (const w of wins) {
        if (normalizePath(w.url) === normalizePath(targetPath)) {
          return w.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});