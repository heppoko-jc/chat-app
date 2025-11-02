// app/chat-list/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Image from "next/image";
import FixedTabBar from "../components/FixedTabBar";
import socket, { setSocketUserId } from "../socket";
import {
  extractUrlAndText,
  fetchLinkMetadata,
  isLinkMessage,
} from "../lib/link-utils";

// ===== バッジ用の軽量ユーティリティ（型安全・any なし） =====
type BadgeCapableNavigator = Navigator & {
  serviceWorker?: {
    ready?: Promise<ServiceWorkerRegistration>;
  };
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};
async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof navigator === "undefined") return null;
    const nav = navigator as unknown as BadgeCapableNavigator;
    const ready = nav.serviceWorker?.ready;
    if (!ready) return null;
    const reg = await ready;
    return reg ?? null;
  } catch {
    return null;
  }
}
async function postToSW(msg: unknown) {
  try {
    const reg = await getSWRegistration();
    reg?.active?.postMessage(msg);
  } catch {}
}
async function setAppBadgeCount(count: number) {
  const n = Math.max(0, count | 0);
  try {
    if (typeof navigator !== "undefined") {
      const nav = navigator as unknown as BadgeCapableNavigator;
      if (typeof nav.setAppBadge === "function") {
        await nav.setAppBadge(n);
      } else {
        const reg = await getSWRegistration();
        await reg?.setAppBadge?.(n);
      }
    }
  } catch {}
  postToSW({ type: "BADGE_SET", count: n });
}

// ===== 型 =====
export interface ChatItem {
  chatId: string;
  matchedUser: { id: string; name: string };
  matchMessage: string;
  latestMessage: string;
  latestMessageAt: string | null;
  latestMessageAtRaw: string | null;
  latestMessageSenderId: string | null;
  latestMessageAtDisplay?: string;
  messages: {
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
  }[];
  matchMessageMatchedAt?: string | null;
  matchHistory?: { message: string; matchedAt: string }[];
}

// ===== 見た目用ユーティリティ =====
function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase();
}
function getBgColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = hash % 360;
  return `hsl(${h}, 70%, 80%)`;
}
function formatChatDate(dateString: string | null): string {
  if (!dateString) return "";
  const now = new Date();
  const date = new Date(dateString);
  if (now.toDateString() === date.toDateString()) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return "昨日";
  for (let i = 2; i <= 5; i++) {
    const prev = new Date(now);
    prev.setDate(now.getDate() - i);
    if (prev.toDateString() === date.toDateString()) {
      const week = ["日", "月", "火", "水", "木", "金", "土"];
      return week[date.getDay()];
    }
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function sortTimestampOf(chat: ChatItem): number {
  const msgTs = chat.latestMessageAt
    ? new Date(chat.latestMessageAt).getTime()
    : 0;
  const matchTs = chat.matchMessageMatchedAt
    ? new Date(chat.matchMessageMatchedAt).getTime()
    : 0;
  return Math.max(msgTs || 0, matchTs || 0);
}

// ===== 本体 =====
export default function ChatList() {
  const router = useRouter();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<{
    [chatId: string]: number;
  }>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [openedMatchChats, setOpenedMatchChats] = useState<Set<string>>(
    new Set()
  );
  const [isOpenedMatchStateLoaded, setIsOpenedMatchStateLoaded] =
    useState(false);
  const [newMatchChats, setNewMatchChats] = useState<Set<string>>(new Set());
  const [chatLinkPreviews, setChatLinkPreviews] = useState<
    Record<string, { url: string; title: string; image?: string } | null>
  >({});

  // 未読合計（バッジ同期に使用）
  const unreadTotal = useMemo(
    () => Object.values(unreadCounts).reduce((a, b) => a + (b || 0), 0),
    [unreadCounts]
  );

  // ユーザーIDとローカル状態ロード
  useEffect(() => {
    const uid =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    setUserId(uid);
  }, []);
  useEffect(() => {
    if (!userId) return;
    setSocketUserId(userId);

    const openedMatchData = localStorage.getItem(
      `opened-match-chats-${userId}`
    );
    if (openedMatchData) {
      try {
        setOpenedMatchChats(new Set(JSON.parse(openedMatchData)));
      } catch {}
    }
    setIsOpenedMatchStateLoaded(true);

    const newMatchData = localStorage.getItem(`new-match-chats-${userId}`);
    if (newMatchData) {
      try {
        setNewMatchChats(new Set(JSON.parse(newMatchData)));
      } catch {}
    }
  }, [userId]);

  // 一覧取得
  const fetchChats = async () => {
    const uid =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    if (!uid) return;
    setIsLoading(true);
    try {
      const res = await axios.get<ChatItem[]>("/api/chat-list", {
        headers: { userId: uid },
      });

      const formatted = res.data.map((c) => {
        const latestRaw = c.latestMessageAt ?? null;
        return {
          ...c,
          latestMessageAt: latestRaw,
          latestMessageAtRaw: latestRaw,
          latestMessageAtDisplay: formatChatDate(latestRaw),
        };
      });

      setChats(formatted);

      // 取得した実チャットは全て join
      formatted
        .filter((c) => !c.chatId.startsWith("dummy-"))
        .forEach((c) => socket.emit("joinChat", c.chatId));

      // 未読件数
      const unread: { [chatId: string]: number } = {};
      for (const chat of res.data) {
        if (!chat.latestMessageAt || chat.latestMessage === "メッセージなし")
          continue;
        if (chat.latestMessageSenderId === uid) {
          unread[chat.chatId] = 0;
          continue;
        }
        const lastRead = localStorage.getItem(`chat-last-read-${chat.chatId}`);
        const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0;
        unread[chat.chatId] = chat.messages.filter(
          (m) =>
            new Date(m.createdAt).getTime() > lastReadTime && m.senderId !== uid
        ).length;
      }
      setUnreadCounts(unread);
    } catch (e) {
      console.error("🚨 チャットリスト取得エラー:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // 初回ロード
  useEffect(() => {
    if (isOpenedMatchStateLoaded) fetchChats();
  }, [isOpenedMatchStateLoaded]);

  // 未読合計が変わるたびに OS バッジへ反映
  useEffect(() => {
    setAppBadgeCount(unreadTotal);
  }, [unreadTotal]);

  // matchMessage の変化検知（ローカル保存）
  useEffect(() => {
    if (!isOpenedMatchStateLoaded || chats.length === 0 || !userId) return;
    const prevRaw = localStorage.getItem(`prev-match-messages-${userId}`);
    let prevMap: Record<string, string> = {};
    if (prevRaw) {
      try {
        prevMap = JSON.parse(prevRaw);
      } catch {}
    }

    const newRaw = localStorage.getItem(`new-match-chats-${userId}`);
    let newSet = new Set<string>();
    if (newRaw) {
      try {
        newSet = new Set(JSON.parse(newRaw));
      } catch {}
    }

    let changed = false;
    for (const chat of chats) {
      const prev = prevMap[chat.chatId];
      if (
        prev !== undefined &&
        prev !== chat.matchMessage &&
        !newSet.has(chat.chatId)
      ) {
        newSet.add(chat.chatId);
        changed = true;
      }
      if (
        prev === undefined &&
        chat.matchMessage &&
        chat.matchMessage !== "（マッチメッセージなし）" &&
        !newSet.has(chat.chatId)
      ) {
        newSet.add(chat.chatId);
        changed = true;
      }
    }
    if (changed) {
      setNewMatchChats(newSet);
      localStorage.setItem(
        `new-match-chats-${userId}`,
        JSON.stringify([...newSet])
      );
    }

    const nextMap: Record<string, string> = {};
    chats.forEach((c) => {
      nextMap[c.chatId] = c.matchMessage;
    });
    localStorage.setItem(
      `prev-match-messages-${userId}`,
      JSON.stringify(nextMap)
    );
  }, [chats, isOpenedMatchStateLoaded, userId]);

  // チャットリストのリンクメタデータを取得
  useEffect(() => {
    const fetchChatLinkMetadata = async () => {
      console.log(
        "🔍 Fetching chat list link metadata for",
        chats.length,
        "chats"
      );
      const newPreviews: Record<
        string,
        { url: string; title: string; image?: string } | null
      > = {};

      for (const chat of chats) {
        if (isLinkMessage(chat.matchMessage)) {
          const urlAndText = extractUrlAndText(chat.matchMessage);
          if (urlAndText) {
            try {
              console.log(
                "🔍 Fetching metadata for chat",
                chat.chatId,
                ":",
                urlAndText.url
              );
              const metadata = await fetchLinkMetadata(urlAndText.url);
              console.log("🔍 Chat metadata received:", metadata);
              newPreviews[chat.chatId] = metadata;
            } catch (error) {
              console.error("Error fetching chat link metadata:", error);
              newPreviews[chat.chatId] = null;
            }
          }
        }
      }

      console.log("🔍 Setting chat link previews:", newPreviews);
      setChatLinkPreviews((prev) => ({ ...prev, ...newPreviews }));
    };

    if (chats.length > 0) {
      fetchChatLinkMetadata();
    }
  }, [chats]);

  // チャット画面からの強調解除通知
  useEffect(() => {
    const onOpened = (e: Event) => {
      const detail = (e as CustomEvent).detail as { chatId?: string };
      const cid = detail?.chatId;
      if (!cid) return;
      setNewMatchChats((prev) => {
        const next = new Set(prev);
        next.delete(cid);
        if (userId)
          localStorage.setItem(
            `new-match-chats-${userId}`,
            JSON.stringify([...next])
          );
        return next;
      });
    };
    window.addEventListener("match-opened", onOpened as EventListener);
    return () =>
      window.removeEventListener("match-opened", onOpened as EventListener);
  }, [userId]);

  // WebSocket: マッチ成立
  useEffect(() => {
    if (!userId) return;
    const handleMatchEstablished = (data: {
      chatId?: string;
      message: string;
      matchedAt: string;
      matchedUserId?: string;
      targetUserId?: string;
    }) => {
      if (data.targetUserId && data.targetUserId !== userId) return;

      const realChatId = data.chatId;
      if (realChatId) {
        socket.emit("joinChat", realChatId);

        // 即座に状態を更新（WebSocketで受信したデータを優先）
        setChats((prev) => {
          const idx = prev.findIndex(
            (c) =>
              c.matchedUser.id === data.matchedUserId || c.chatId === realChatId
          );

          // チャットがまだリストにない場合は新規追加（dummy-チャットの可能性）
          if (idx === -1) {
            // dummy-チャットを探す
            const dummyIdx = prev.findIndex(
              (c) =>
                c.chatId.startsWith("dummy-") &&
                c.matchedUser.id === data.matchedUserId
            );

            if (dummyIdx !== -1) {
              // dummy-チャットを実際のIDに変換
              const next = [...prev];
              const item = { ...next[dummyIdx] };
              item.chatId = realChatId;
              item.matchMessage = data.message;
              item.matchMessageMatchedAt = data.matchedAt;
              item.matchHistory = [
                { message: data.message, matchedAt: data.matchedAt },
              ];
              next[dummyIdx] = item;
              return next;
            }
            // 見つからない場合は既存のリストをそのまま返す（後でfetchChatsで取得）
            return prev;
          }

          const next = [...prev];
          const item = { ...next[idx] };

          if (item.chatId.startsWith("dummy-")) item.chatId = realChatId;

          // 重複チェック（同じmatchedAtとmessageの組み合わせを防ぐ）
          const existingMatch = item.matchHistory?.find(
            (m) => m.matchedAt === data.matchedAt && m.message === data.message
          );

          if (!existingMatch) {
            const list = [
              ...(item.matchHistory || []),
              { message: data.message, matchedAt: data.matchedAt },
            ];
            const map = new Map(
              list.map((m) => [`${m.matchedAt}|${m.message}`, m])
            );
            item.matchHistory = Array.from(map.values()).sort(
              (a, b) =>
                new Date(a.matchedAt).getTime() -
                new Date(b.matchedAt).getTime()
            );
            item.matchMessage = data.message;
            item.matchMessageMatchedAt = data.matchedAt;

            next[idx] = item;
          }

          return next;
        });

        setNewMatchChats((prev) => {
          const next = new Set(prev);
          next.add(realChatId);
          if (userId)
            localStorage.setItem(
              `new-match-chats-${userId}`,
              JSON.stringify([...next])
            );
          return next;
        });
      }

      // サーバーから再取得は遅延実行（状態更新後に確実に最新データを取得）
      // 500ms待機してからfetchChatsを呼ぶことで、サーバー側のデータ更新が完了していることを確認
      setTimeout(() => {
        fetchChats();
      }, 500);
    };

    socket.on("matchEstablished", handleMatchEstablished);
    return () => {
      socket.off("matchEstablished", handleMatchEstablished);
    };
  }, [userId]);

  // WebSocket: 新着メッセージで再取得
  useEffect(() => {
    const handleNewMessage = (payload: {
      chatId: string;
      message: { id: string };
    }) => {
      console.log(`📬 チャットリストで newMessage 受信:`, {
        chatId: payload.chatId,
        messageId: payload.message?.id,
      });
      fetchChats();
    };
    socket.on("newMessage", handleNewMessage);
    return () => {
      socket.off("newMessage", handleNewMessage);
    };
  }, []);

  // クリックで既読＆ハイライト解除
  const handleOpenChat = async (item: ChatItem) => {
    const uid = localStorage.getItem("userId");
    if (!uid) return;

    const goto = async (realId: string) => {
      localStorage.setItem(
        `chat-last-read-${realId}`,
        new Date().toISOString()
      );

      // 既読反映＋バッジ同期
      setUnreadCounts((prev) => {
        const next = { ...prev, [realId]: 0 };
        const total = Object.values(next).reduce((a, b) => a + (b || 0), 0);
        setAppBadgeCount(total);
        return next;
      });

      setOpenedMatchChats((prev) => {
        const next = new Set(prev);
        next.add(realId);
        if (userId)
          localStorage.setItem(
            `opened-match-chats-${userId}`,
            JSON.stringify([...next])
          );
        return next;
      });
      setNewMatchChats((prev) => {
        const next = new Set(prev);
        next.delete(realId);
        if (userId)
          localStorage.setItem(
            `new-match-chats-${userId}`,
            JSON.stringify([...next])
          );
        return next;
      });
      router.push(`/chat/${realId}`);
    };

    if (item.chatId.startsWith("dummy-")) {
      try {
        const res = await axios.post<{ chatId: string }>(
          "/api/chat/ensure",
          { partnerId: item.matchedUser.id },
          { headers: { userId: uid } }
        );
        const realId = res.data.chatId;
        setChats((prev) =>
          prev.map((c) =>
            c.chatId === item.chatId ? { ...c, chatId: realId } : c
          )
        );
        await goto(realId);
      } catch (e) {
        console.error("🚨 ensure エラー:", e);
      }
    } else {
      await goto(item.chatId);
    }
  };

  // 表示用の最終ソート
  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const at = sortTimestampOf(a);
      const bt = sortTimestampOf(b);
      if (at === bt) return 0;
      return bt - at;
    });
  }, [chats]);

  return (
    <div className="flex flex-col h-[100dvh] bg-gradient-to-b from-gray-50 to-white overflow-hidden">
      <div className="shrink-0 bg-white/80 backdrop-blur-sm z-10 p-6 border-b border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-center text-gray-800">Chat</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {!isOpenedMatchStateLoaded || (isLoading && chats.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-medium">読み込み中…</p>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-gray-500 font-medium">
              まだチャットがありません
            </p>
            <p className="text-gray-400 text-sm mt-1">
              メイン画面でメッセージを送信してみてください
            </p>
          </div>
        ) : (
          <ul className="space-y-2 pb-20">
            {sortedChats.map((chat) => {
              const isLatestFromMe = chat.latestMessageSenderId === userId;
              const isMatched =
                chat.matchMessage !== "（マッチメッセージなし）";
              const hasOpenedMatch = openedMatchChats.has(chat.chatId);
              const isNewMatch = newMatchChats.has(chat.chatId);
              const shouldShowMatchHighlight =
                (isMatched && !hasOpenedMatch) || isNewMatch;

              return (
                <li
                  key={chat.chatId}
                  onClick={() => handleOpenChat(chat)}
                  className={`flex items-center backdrop-blur-sm rounded-3xl shadow-lg px-5 py-4 cursor-pointer hover:shadow-xl active:scale-98 transition-all duration-200 border mb-3 ${
                    shouldShowMatchHighlight
                      ? "bg-gradient-to-r from-orange-100 to-orange-200 border-orange-300 shadow-orange-300/50"
                      : "bg-white/90 border-white/50 hover:bg-white"
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl mr-4 shadow-lg ${
                        shouldShowMatchHighlight
                          ? "ring-2 ring-orange-300 ring-offset-2"
                          : ""
                      }`}
                      style={{
                        backgroundColor: getBgColor(chat.matchedUser.name),
                      }}
                    >
                      {getInitials(chat.matchedUser.name)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-gray-800 truncate">
                        {chat.matchedUser.name}
                      </span>
                      <div className="flex flex-col items-end min-w-[60px]">
                        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                          {chat.latestMessageAtDisplay ||
                            formatChatDate(chat.latestMessageAt)}
                        </span>
                        {unreadCounts[chat.chatId] > 0 && !isLatestFromMe && (
                          <span className="mt-1 flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-r from-green-400 to-green-500 text-white text-xs font-bold shadow-md">
                            {unreadCounts[chat.chatId]}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mb-1">
                      {isMatched ? (
                        chatLinkPreviews[chat.chatId] ? (
                          // リンクプレビュー表示
                          <div className="flex items-center gap-2">
                            {chatLinkPreviews[chat.chatId]?.image ? (
                              <Image
                                src={chatLinkPreviews[chat.chatId]!.image!}
                                alt={chatLinkPreviews[chat.chatId]!.title}
                                width={32}
                                height={32}
                                className="w-8 h-8 object-cover rounded border border-orange-200 flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  e.currentTarget.nextElementSibling?.classList.remove(
                                    "hidden"
                                  );
                                }}
                              />
                            ) : null}
                            <div
                              className={`w-5 h-5 rounded bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0 ${
                                chatLinkPreviews[chat.chatId]?.image
                                  ? "hidden"
                                  : ""
                              }`}
                            >
                              URL
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-xs font-bold truncate ${
                                  shouldShowMatchHighlight
                                    ? "text-orange-700"
                                    : "text-gray-800"
                                }`}
                              >
                                {chatLinkPreviews[chat.chatId]!.title}
                              </p>
                              {(() => {
                                const urlAndText = extractUrlAndText(
                                  chat.matchMessage
                                );
                                return urlAndText && urlAndText.text ? (
                                  <p
                                    className={`text-xs truncate ${
                                      shouldShowMatchHighlight
                                        ? "text-orange-600"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    {urlAndText.text}
                                  </p>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        ) : isLinkMessage(chat.matchMessage) ? (
                          // リンクメッセージだがプレビューがない場合（ローディング中など）
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin flex-shrink-0"></div>
                            <span
                              className={`text-xs ${
                                shouldShowMatchHighlight
                                  ? "text-orange-600"
                                  : "text-gray-500"
                              }`}
                            >
                              リンク情報を取得中...
                            </span>
                          </div>
                        ) : (
                          // 通常のメッセージ表示
                          <p
                            className={`text-sm truncate font-medium ${
                              shouldShowMatchHighlight
                                ? "text-orange-700 font-semibold"
                                : "text-gray-600"
                            }`}
                          >
                            「{chat.matchMessage}」
                          </p>
                        )
                      ) : (
                        <p className="text-sm text-gray-400">
                          まだマッチしていません
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {chat.latestMessage}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0">
        <FixedTabBar />
      </div>
    </div>
  );
}
