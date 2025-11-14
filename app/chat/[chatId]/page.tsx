// app/chat/[chatId]/page.tsx

"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import socket from "../../socket";
import Image from "next/image";
import { useChatData } from "../../contexts/ChatDataContext";
import {
  extractUrlAndText,
  fetchLinkMetadata,
  isLinkMessage,
} from "../../lib/link-utils";
import ErrorNotification from "../../components/ErrorNotification";

type BadgeCapableNavigator = Navigator & {
  serviceWorker?: {
    ready?: Promise<ServiceWorkerRegistration>;
  };
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

/** SW にメッセージ送る（存在すれば） */
async function postToSW(msg: unknown) {
  try {
    const reg = await getSWRegistration();
    reg?.active?.postMessage(msg);
  } catch {
    // noop
  }
}

/** 既読にした分を OS バッジから差し引く（合計は SW が保持） */
function decrementBadge(delta: number) {
  const d = Math.max(0, delta | 0);
  if (d > 0) postToSW({ type: "BADGE_DECREMENT", delta: d });
}

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

export type Message = {
  id: string;
  sender: { id: string; name: string };
  content: string;
  createdAt: string;
  formattedDate?: string;
};

function isNear(aIso: string, bIso: string, ms = 7000) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.abs(a - b) <= ms;
}

type MatchPayload = {
  chatId?: string;
  message: string;
  matchedAt: string;
  matchedUserId?: string;
  targetUserId?: string;
  matchedUserName?: string;
  matchId?: string;
};

export default function Chat() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params?.chatId)
    ? params.chatId[0]
    : (params?.chatId as string);

  const { chatData, chatList, isPreloading, setChatData, setChatList } =
    useChatData();
  const initialMessages = chatData[id] as Message[] | undefined;

  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [newMessage, setNewMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [matchMessage, setMatchMessage] = useState<string>("");
  const [matchMessageMatchedAt, setMatchMessageMatchedAt] = useState<
    string | null
  >(null);
  const [isSending, setIsSending] = useState(false);
  const [matchHistory, setMatchHistory] = useState<
    { message: string; matchedAt: string }[]
  >([]);
  const [matchLinkPreviews, setMatchLinkPreviews] = useState<
    Record<string, { url: string; title: string; image?: string } | null>
  >({});
  const [headerLinkPreview, setHeaderLinkPreview] = useState<{
    url: string;
    title: string;
    image?: string;
  } | null>(null);

  // リンク確認ポップアップの状態
  const [showLinkConfirmModal, setShowLinkConfirmModal] = useState<{
    isVisible: boolean;
    url: string;
    title: string;
    image?: string;
  } | null>(null);

  // エラー通知の状態
  const [errorNotification, setErrorNotification] = useState<{
    isVisible: boolean;
    message: string;
  }>({
    isVisible: false,
    message: "",
  });

  // ===== レイアウト参照 =====
  const mainRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 受信重複ガード
  const seenIdsRef = useRef<Set<string>>(new Set());

  // ===== 未送信メッセージの保存・復元 =====
  useEffect(() => {
    if (!id) return;
    const saved = localStorage.getItem(`draft-message-${id}`);
    if (saved) setNewMessage(saved);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (newMessage.trim()) {
      localStorage.setItem(`draft-message-${id}`, newMessage);
    } else {
      localStorage.removeItem(`draft-message-${id}`);
    }
  }, [newMessage, id]);

  // ===== テキストエリア：自動リサイズ（最大 3 行まで） =====
  const autoResizeTextarea = useCallback(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const line = parseFloat(getComputedStyle(ta).lineHeight || "20");
    const padding =
      parseFloat(getComputedStyle(ta).paddingTop || "0") +
      parseFloat(getComputedStyle(ta).paddingBottom || "0");
    const maxH = line * 3 + padding; // 3行分まで
    const newH = Math.min(ta.scrollHeight, maxH);
    ta.style.maxHeight = `${maxH}px`;
    ta.style.height = `${newH}px`;
    ta.style.overflowY = ta.scrollHeight > maxH ? "auto" : "hidden";
  }, []);

  // ===== 最下行を確実に見せる =====
  const scrollToBottom = useCallback((smooth = false) => {
    const main = mainRef.current;
    if (!main) return;

    if (smooth) {
      main.scrollTo({
        top: main.scrollHeight,
        behavior: "smooth",
      });
    } else {
      requestAnimationFrame(() => {
        main.scrollTop = main.scrollHeight;
      });
    }
  }, []);

  // 初期 seenID
  useEffect(() => {
    if (!id) return;
    const set = seenIdsRef.current;
    set.clear();
    (initialMessages ?? []).forEach((m) => set.add(m.id));
  }, [id, initialMessages]);

  // 通知経由など“どの導線でも”チャットを開いたら、チャットリスト側の強調とバッジを解除
  useEffect(() => {
    if (!id) return;
    const uid =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    // 1) チャットリストにブロードキャスト（開かれたことを通知）
    try {
      window.dispatchEvent(
        new CustomEvent("match-opened", { detail: { chatId: id } })
      );
    } catch {}
    // 2) ローカル永続（チャットリスト未表示でも次回反映されるように）
    try {
      if (uid) {
        // opened-match-chats に追加
        const openedRaw = localStorage.getItem(`opened-match-chats-${uid}`);
        const openedSet = new Set<string>(
          openedRaw ? JSON.parse(openedRaw) : []
        );
        if (!openedSet.has(id)) openedSet.add(id);
        localStorage.setItem(
          `opened-match-chats-${uid}`,
          JSON.stringify([...openedSet])
        );

        // new-match-chats から除去
        const newRaw = localStorage.getItem(`new-match-chats-${uid}`);
        const newSet = new Set<string>(newRaw ? JSON.parse(newRaw) : []);
        if (newSet.has(id)) {
          newSet.delete(id);
          localStorage.setItem(
            `new-match-chats-${uid}`,
            JSON.stringify([...newSet])
          );
        }
      }
    } catch {}
  }, [id]);

  // ユーザー固有ルームへ join
  useEffect(() => {
    const uid = localStorage.getItem("userId");
    setCurrentUserId(uid);
    if (uid) socket.emit("setUserId", uid);
  }, []);

  // ダミーIDなら一覧へ戻す
  useEffect(() => {
    if (id?.startsWith("dummy-")) router.replace("/chat-list");
  }, [id, router]);

  // ===== チャット画面を開いた時に最新メッセージを再取得 =====
  useEffect(() => {
    if (!id || id.startsWith("dummy-")) return;

    const fetchLatestMessages = async () => {
      try {
        console.log(`🔄 チャット ${id} の最新メッセージを再取得中...`);
        const response = await fetch(`/api/chat/${id}`);
        if (response.ok) {
          const latestMessages = await response.json();
          const formattedMessages = latestMessages.map((msg: Message) => ({
            ...msg,
            formattedDate: new Date(msg.createdAt).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          }));

          console.log(
            `✅ チャット ${id} の最新メッセージを取得完了: ${formattedMessages.length}件`
          );
          setMessages(formattedMessages);

          // chatDataも更新（他の画面との同期のため）
          setChatData((prev) => ({ ...prev, [id]: formattedMessages }));
        } else {
          console.error(
            `❌ チャット ${id} のメッセージ取得に失敗:`,
            response.status
          );
        }
      } catch (error) {
        console.error(`❌ チャット ${id} の最新メッセージ取得エラー:`, error);
      }
    };

    fetchLatestMessages();
  }, [id, setChatData]);

  // 一覧からヘッダー/マッチ履歴を初期化
  const chatInList = chatList?.find((c) => c.chatId === id);
  useEffect(() => {
    console.log("🔍 chatInList changed:", chatInList);
    if (!chatInList) {
      console.log("🔍 No chatInList found, skipping initialization");
      return;
    }

    const matchHistoryFromList = chatInList.matchHistory || [];
    console.log("🔍 matchHistory from chatList:", matchHistoryFromList);

    setMatchMessage(chatInList.matchMessage || "");
    setMatchMessageMatchedAt(chatInList.matchMessageMatchedAt || null);

    const sortedHistory = matchHistoryFromList
      .slice()
      .sort(
        (a, b) =>
          new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
      );

    console.log("🔍 Setting sorted matchHistory:", sortedHistory);
    setMatchHistory(sortedHistory);
  }, [chatInList]);

  // ===== ルーム参加 & 受信購読（newMessage） =====
  useEffect(() => {
    if (!id || id.startsWith("dummy-")) return;

    console.log(`🔌 チャット ${id} のSocket.IO接続を開始`);

    // 接続済みならすぐに参加
    if (socket.connected) {
      console.log("✅ Socket.IO既に接続済み - すぐにルーム参加");
      socket.emit("joinChat", id);
    } else {
      console.log("⏳ Socket.IO接続待機中...");
      // 接続完了を待つ
      socket.once("connect", () => {
        console.log("✅ Socket.IO接続完了 - ルーム参加");
        socket.emit("joinChat", id);
      });
    }

    const upsertFromServer = (msg: Message) => {
      console.log(`📨 メッセージ受信:`, {
        id: msg.id,
        sender: msg.sender.name,
        content:
          msg.content.substring(0, 20) + (msg.content.length > 20 ? "..." : ""),
      });

      if (seenIdsRef.current.has(msg.id)) {
        console.log(`⏭️ 既に受信済みのメッセージ: ${msg.id}`);
        return;
      }
      seenIdsRef.current.add(msg.id);

      setMessages((prev) => {
        const idx = prev.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.sender.id === msg.sender.id &&
            m.content === msg.content &&
            isNear(m.createdAt, msg.createdAt)
        );
        const next = [...prev];
        const formatted: Message = {
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        if (idx !== -1) {
          console.log(`🔄 一時メッセージを本物に置き換え: ${msg.id}`);
          next[idx] = formatted;
        } else {
          console.log(`➕ 新しいメッセージを追加: ${msg.id}`);
          next.push(formatted);
        }
        return next;
      });

      // chatData 同期
      setChatData((prev) => {
        const list = prev[id] || [];
        const idx = list.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.sender.id === msg.sender.id &&
            m.content === msg.content &&
            isNear(m.createdAt, msg.createdAt)
        );
        const formatted: Message = {
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        const next = [...list];
        if (idx !== -1) next[idx] = formatted;
        else next.push(formatted);
        return { ...prev, [id]: next };
      });

      // リストの最新情報更新
      setChatList((prev) => {
        if (!prev) return prev;
        const updated = prev
          .map((c) =>
            c.chatId === id
              ? {
                  ...c,
                  latestMessage: msg.content,
                  latestMessageAt: msg.createdAt,
                  latestMessageSenderId: msg.sender.id,
                  latestMessageAtDisplay: new Date(
                    msg.createdAt
                  ).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }
              : c
          )
          .sort((a, b) => {
            const ta = a.latestMessageAt
              ? new Date(a.latestMessageAt).getTime()
              : 0;
            const tb = b.latestMessageAt
              ? new Date(b.latestMessageAt).getTime()
              : 0;
            return tb - ta;
          });
        return updated;
      });

      scrollToBottom();
    };

    const handleNewMessage = (payload: {
      chatId: string;
      message: Message;
    }) => {
      console.log(`📬 newMessageイベント受信:`, {
        chatId: payload.chatId,
        currentChatId: id,
        messageId: payload.message?.id,
      });

      if (payload.chatId !== id) {
        console.log(
          `⏭️ 別のチャットのメッセージ: ${payload.chatId} (現在: ${id})`
        );
        return;
      }

      upsertFromServer(payload.message);
    };

    socket.on("newMessage", handleNewMessage);

    return () => {
      console.log(`🔌 チャット ${id} のSocket.IO接続を解除`);
      socket.off("newMessage", handleNewMessage);
    };
  }, [id, setChatData, setChatList, scrollToBottom]);

  // ===== マッチ成立のリアルタイム反映 =====
  useEffect(() => {
    if (!id || id.startsWith("dummy-")) return;

    const partnerId =
      chatList?.find((c) => c.chatId === id)?.matchedUser.id ||
      messages.find((m) => m.sender.id !== currentUserId)?.sender.id ||
      null;

    const apply = (data: MatchPayload) => {
      if (data.chatId && data.chatId !== id) return;
      if (
        !data.chatId &&
        partnerId &&
        data.matchedUserId &&
        data.matchedUserId !== partnerId
      )
        return;

      setMatchMessage(data.message);
      setMatchMessageMatchedAt(data.matchedAt);

      setMatchHistory((prev) => {
        if (
          prev.some(
            (m) => m.matchedAt === data.matchedAt && m.message === data.message
          )
        )
          return prev;
        const next = [
          ...prev,
          { message: data.message, matchedAt: data.matchedAt },
        ];
        next.sort(
          (a, b) =>
            new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
        );
        return next;
      });

      setChatList((prev) => {
        if (!prev) return prev;
        return prev.map((c) =>
          c.chatId === id
            ? {
                ...c,
                matchMessage: data.message,
                matchMessageMatchedAt: data.matchedAt,
                matchHistory: [
                  ...(c.matchHistory || []),
                  { message: data.message, matchedAt: data.matchedAt },
                ].sort(
                  (a, b) =>
                    new Date(a.matchedAt).getTime() -
                    new Date(b.matchedAt).getTime()
                ),
              }
            : c
        );
      });

      scrollToBottom();
    };

    const onMatchEstablished = (data: MatchPayload) => apply(data);
    socket.on("matchEstablished", onMatchEstablished);
    return () => {
      socket.off("matchEstablished", onMatchEstablished);
    };
  }, [id, chatList, messages, currentUserId, setChatList, scrollToBottom]);

  // マッチ履歴のリンクメタデータを取得
  useEffect(() => {
    console.log("🔍 matchHistory changed:", matchHistory);

    const fetchMatchLinkMetadata = async () => {
      console.log("🔍 fetchMatchLinkMetadata started");
      const newPreviews: Record<
        string,
        { url: string; title: string; image?: string } | null
      > = {};

      for (const match of matchHistory) {
        console.log("🔍 Processing match:", match.message);
        const isLink = isLinkMessage(match.message);
        console.log("🔍 Is link message:", isLink);

        if (isLink) {
          const urlAndText = extractUrlAndText(match.message);
          console.log("🔍 Extracted URL and text:", urlAndText);

          if (urlAndText) {
            try {
              console.log("🔍 Fetching metadata for URL:", urlAndText.url);
              const metadata = await fetchLinkMetadata(urlAndText.url);
              console.log("🔍 Metadata received:", metadata);
              newPreviews[`${match.message}-${match.matchedAt}`] = metadata;
            } catch (error) {
              console.error("Error fetching match link metadata:", error);
              newPreviews[`${match.message}-${match.matchedAt}`] = null;
            }
          }
        }
      }

      console.log("🔍 Setting new previews:", newPreviews);
      setMatchLinkPreviews((prev) => ({ ...prev, ...newPreviews }));
    };

    if (matchHistory.length > 0) {
      console.log("🔍 matchHistory has items, starting fetch");
      fetchMatchLinkMetadata();
    } else {
      console.log("🔍 matchHistory is empty, skipping fetch");
    }
  }, [matchHistory]);

  // ヘッダー用のリンクメタデータを取得
  useEffect(() => {
    if (!matchMessage) {
      setHeaderLinkPreview(null);
      return;
    }

    if (isLinkMessage(matchMessage)) {
      console.log("🔍 Fetching header link metadata for:", matchMessage);
      const urlAndText = extractUrlAndText(matchMessage);
      if (urlAndText) {
        fetchLinkMetadata(urlAndText.url)
          .then((metadata) => {
            console.log("🔍 Header metadata received:", metadata);
            setHeaderLinkPreview(metadata);
          })
          .catch((error) => {
            console.error("Error fetching header link metadata:", error);
            setHeaderLinkPreview(null);
          });
      }
    } else {
      setHeaderLinkPreview(null);
    }
  }, [matchMessage]);

  // ===== 初回＆id変化時はサーバから最新を取得（キャッシュ最適化） =====
  useEffect(() => {
    if (!id || id.startsWith("dummy-")) return;

    // 既にキャッシュされたデータがあれば、それを使用して即座に表示
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      scrollToBottom();
      return; // API呼び出しをスキップして高速化
    }

    let aborted = false;
    (async () => {
      try {
        const res = await axios.get<Message[]>(`/api/chat/${id}`);
        if (aborted) return;

        // フォーマット処理を非同期化（メインスレッドをブロックしない）
        const processMessages = () => {
          if (aborted) return;
          const formatted = res.data.map((msg) => ({
            ...msg,
            formattedDate: new Date(msg.createdAt).toLocaleTimeString("ja-JP", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          }));
          formatted.forEach((m) => seenIdsRef.current.add(m.id));
          setMessages(formatted);
          setChatData((prev) => ({ ...prev, [id]: formatted }));
          scrollToBottom();
        };

        // requestIdleCallback の polyfill（Safari対応）
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(processMessages, { timeout: 1000 });
        } else {
          setTimeout(processMessages, 0);
        }
      } catch (e) {
        console.error("🚨 メッセージ取得エラー:", e);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [id, initialMessages, setChatData, scrollToBottom]);

  // ===== 既読書き込み（★ 未読分だけバッジ減算を追加） =====
  useEffect(() => {
    if (!id || id.startsWith("dummy-")) return;

    const computeUnreadDelta = () => {
      const uid =
        typeof window !== "undefined" ? localStorage.getItem("userId") : null;
      if (!uid) return 0;
      const lastRead = localStorage.getItem(`chat-last-read-${id}`);
      const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0;
      return messages.filter(
        (m) =>
          new Date(m.createdAt).getTime() > lastReadTime && m.sender.id !== uid
      ).length;
    };

    const write = () => {
      // 既読書き込みの直前に、このチャットの未読件数を差し引く
      const delta = computeUnreadDelta();
      if (delta > 0) decrementBadge(delta);
      localStorage.setItem(`chat-last-read-${id}`, new Date().toISOString());
    };

    write();
    const onVis = () => {
      if (document.visibilityState === "visible") write();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      write();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [id, messages]);

  // テキスト変更時は自動リサイズ
  useEffect(() => {
    autoResizeTextarea();
  }, [newMessage, autoResizeTextarea]);

  // 入力欄フォーカス時（高さ確定後にボトムへ）
  const handleFocus = () => {
    setTimeout(() => {
      autoResizeTextarea();
      scrollToBottom();
    }, 300); // キーボードアニメーション後にスクロール
  };

  // 入力欄ブラー時（キーボードが閉じた後のスクロール調整）
  const handleBlur = () => {
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  };

  // ===== 送信 =====
  const handleSend = async () => {
    if (!id || id.startsWith("dummy-") || !newMessage.trim() || isSending)
      return;
    const senderId = localStorage.getItem("userId");
    if (!senderId) {
      alert("ログインしてください");
      return;
    }

    setIsSending(true);
    const contentToSend = newMessage;
    // メッセージはAPI呼び出し成功時のみクリアする

    try {
      const res = await axios.post<Message>(`/api/chat/${id}`, {
        senderId,
        content: contentToSend,
      });
      const saved = res.data;

      // 送信成功時のみメッセージをクリア
      setNewMessage("");

      // 送信後にドラフトをクリア
      if (id) {
        localStorage.removeItem(`draft-message-${id}`);
      }

      if (seenIdsRef.current.has(saved.id)) {
        setIsSending(false);
        setTimeout(() => inputRef.current?.focus(), 0); // キーボードは閉じない
        return;
      }

      seenIdsRef.current.add(saved.id);

      // 送信成功時のみ送信アニメーションを表示
      const temp: Message = {
        id: `temp-${Date.now()}`,
        sender: { id: senderId, name: "自分" },
        content: contentToSend,
        createdAt: new Date().toISOString(),
        formattedDate: new Date().toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, temp]);
      setChatData((prev) => ({ ...prev, [id]: [...(prev[id] || []), temp] }));
      scrollToBottom();

      setMessages((prev) => {
        const idx = prev.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.sender.id === senderId &&
            m.content === contentToSend &&
            isNear(m.createdAt, saved.createdAt)
        );
        const formatted: Message = {
          ...saved,
          formattedDate: new Date(saved.createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = formatted;
          return next;
        }
        return [...prev, formatted];
      });

      setChatData((prev) => {
        const list = prev[id] || [];
        const idx = list.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.sender.id === senderId &&
            m.content === contentToSend &&
            isNear(m.createdAt, saved.createdAt)
        );
        const formatted: Message = {
          ...saved,
          formattedDate: new Date(saved.createdAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        const next = [...list];
        if (idx !== -1) next[idx] = formatted;
        else next.push(formatted);
        return { ...prev, [id]: next };
      });

      scrollToBottom();
    } catch (e) {
      console.error("🚨 送信エラー:", e);

      // 非表示キーワードが検出された場合
      if (
        axios.isAxiosError(e) &&
        e.response?.data?.error === "hidden_keyword_detected"
      ) {
        // メッセージはクリアしない（送信されなかったため）
        // アプリ内通知を表示
        setErrorNotification({
          isVisible: true,
          message:
            "非表示設定されている言葉が含まれるため、送信されませんでした。",
        });
      } else {
        // その他のエラーの場合もメッセージはクリアしない
        setErrorNotification({
          isVisible: true,
          message: "メッセージの送信に失敗しました。",
        });
      }
    } finally {
      setIsSending(false);
      setTimeout(() => {
        inputRef.current?.focus(); // キーボード閉じさせない
        autoResizeTextarea();
        scrollToBottom();
      }, 0);
    }
  };

  // ====== ヘッダーの相手表示 ======
  const headerName =
    chatInList?.matchedUser.name ||
    messages.find((m) => m.sender.id !== currentUserId)?.sender.name ||
    "チャット";

  // ====== マッチ履歴のタップハンドラー ======
  const handleMatchTap = (match: { message: string; matchedAt: string }) => {
    if (isLinkMessage(match.message)) {
      const urlAndText = extractUrlAndText(match.message);
      if (urlAndText) {
        const matchKey = `${match.message}-${match.matchedAt}`;
        const linkPreview = matchLinkPreviews[matchKey];

        setShowLinkConfirmModal({
          isVisible: true,
          url: urlAndText.url,
          title: linkPreview?.title || urlAndText.url,
          image: linkPreview?.image,
        });
      }
    }
  };

  // ====== タイムライン描画 ======
  function renderMessagesWithDate(msgs: Message[]) {
    console.log("🔍 renderMessagesWithDate called with:", {
      msgs: msgs.length,
      matchHistory: matchHistory.length,
    });
    const result: React.ReactElement[] = [];
    let lastDate = "";
    const ensureDateBar = (iso: string) => {
      const key = new Date(iso).toISOString().slice(0, 10);
      if (key !== lastDate) {
        result.push(
          <div key={`date-${key}`} className="flex justify-center my-2">
            <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full shadow-sm">
              {key.replace(/-/g, "/")}
            </span>
          </div>
        );
        lastDate = key;
      }
    };
    const matches = (matchHistory || [])
      .slice()
      .sort(
        (a, b) =>
          new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
      );

    if (msgs.length === 0) {
      console.log("🔍 No messages, rendering matches only:", matches.length);
      matches.forEach((m, idx) => {
        ensureDateBar(m.matchedAt);

        const matchKey = `${m.message}-${m.matchedAt}`;
        const linkPreview = matchLinkPreviews[matchKey];

        console.log("🔍 Rendering match-only:", {
          message: m.message,
          matchKey,
          linkPreview,
          hasPreview: !!linkPreview,
        });

        result.push(
          <div
            key={`match-only-${idx}-${m.matchedAt}`}
            className="flex justify-center my-2"
          >
            <div
              className={`bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold max-w-[80%] ${
                isLinkMessage(m.message)
                  ? "cursor-pointer hover:bg-orange-200 transition-colors"
                  : ""
              }`}
              onClick={() => isLinkMessage(m.message) && handleMatchTap(m)}
            >
              <span className="text-orange-600 font-bold">
                マッチしたことば:
              </span>
              {linkPreview ? (
                // リンクプレビュー表示
                <div className="flex items-center gap-2 mt-1">
                  {linkPreview.image ? (
                    <Image
                      src={linkPreview.image}
                      alt={linkPreview.title}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-cover rounded border border-orange-200 flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextElementSibling?.classList.remove(
                          "hidden"
                        );
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-6 h-6 rounded bg-orange-200 border border-orange-300 flex items-center justify-center text-orange-700 font-bold text-xs flex-shrink-0 ${
                      linkPreview.image ? "hidden" : ""
                    }`}
                  >
                    URL
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-orange-700 truncate">
                      {linkPreview.title}
                    </p>
                    {(() => {
                      const urlAndText = extractUrlAndText(m.message);
                      return urlAndText && urlAndText.text ? (
                        <p className="text-xs text-orange-600 truncate mt-0.5">
                          {urlAndText.text}
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>
              ) : isLinkMessage(m.message) ? (
                // リンクメッセージだがプレビューがない場合（ローディング中など）
                <div className="mt-1 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin flex-shrink-0"></div>
                  <span className="text-xs text-orange-600">
                    リンク情報を取得中...
                  </span>
                </div>
              ) : (
                // 通常のメッセージ表示
                <div className="mt-1">「{m.message}」</div>
              )}
            </div>
          </div>
        );
      });
      return result;
    }

    let mi = 0;
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const msgTs = new Date(msg.createdAt).getTime();
      while (
        mi < matches.length &&
        new Date(matches[mi].matchedAt).getTime() <= msgTs
      ) {
        const m = matches[mi];
        ensureDateBar(m.matchedAt);

        const matchKey = `${m.message}-${m.matchedAt}`;
        const linkPreview = matchLinkPreviews[matchKey];

        result.push(
          <div
            key={`match-before-${mi}-${m.matchedAt}`}
            className="flex justify-center my-2"
          >
            <div
              className={`bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold max-w-[80%] ${
                isLinkMessage(m.message)
                  ? "cursor-pointer hover:bg-orange-200 transition-colors"
                  : ""
              }`}
              onClick={() => isLinkMessage(m.message) && handleMatchTap(m)}
            >
              <span className="text-orange-600 font-bold">
                マッチしたことば:
              </span>
              {linkPreview ? (
                // リンクプレビュー表示
                <div className="flex items-center gap-2 mt-1">
                  {linkPreview.image ? (
                    <Image
                      src={linkPreview.image}
                      alt={linkPreview.title}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-cover rounded border border-orange-200 flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextElementSibling?.classList.remove(
                          "hidden"
                        );
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-6 h-6 rounded bg-orange-200 border border-orange-300 flex items-center justify-center text-orange-700 font-bold text-xs flex-shrink-0 ${
                      linkPreview.image ? "hidden" : ""
                    }`}
                  >
                    URL
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-orange-700 truncate">
                      {linkPreview.title}
                    </p>
                    {(() => {
                      const urlAndText = extractUrlAndText(m.message);
                      return urlAndText && urlAndText.text ? (
                        <p className="text-xs text-orange-600 truncate mt-0.5">
                          {urlAndText.text}
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>
              ) : isLinkMessage(m.message) ? (
                // リンクメッセージだがプレビューがない場合（ローディング中など）
                <div className="mt-1 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin flex-shrink-0"></div>
                  <span className="text-xs text-orange-600">
                    リンク情報を取得中...
                  </span>
                </div>
              ) : (
                // 通常のメッセージ表示
                <div className="mt-1">「{m.message}」</div>
              )}
            </div>
          </div>
        );
        mi++;
      }
      ensureDateBar(msg.createdAt);
      const isMe = msg.sender.id === currentUserId;
      result.push(
        <div
          key={msg.id}
          data-msg-row="1"
          className={`flex items-end gap-1 ${
            isMe ? "justify-end" : "justify-start"
          } w-full mb-1`}
        >
          {!isMe && (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-base mr-2 shadow flex-shrink-0"
              style={{ backgroundColor: getBgColor(msg.sender.name) }}
            >
              {getInitials(msg.sender.name)}
            </div>
          )}
          {/* 自分のメッセージの場合、時刻を左に */}
          {isMe && (
            <span className="text-[10px] text-gray-400 self-end mb-1 flex-shrink-0">
              {msg.formattedDate}
            </span>
          )}
          <div
            className={`relative px-4 py-2 text-sm rounded-2xl shadow-md max-w-[70%] ${
              isMe
                ? "bg-green-400 text-white rounded-br-md bubble-right"
                : "bg-white text-black rounded-bl-md bubble-left border border-gray-200"
            }`}
            style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}
          >
            {msg.content}
          </div>
          {/* 相手のメッセージの場合、時刻を右に */}
          {!isMe && (
            <span className="text-[10px] text-gray-400 self-end mb-1 flex-shrink-0">
              {msg.formattedDate}
            </span>
          )}
        </div>
      );
    }

    console.log("🔍 Starting match rendering loop:", {
      matchesCount: matches.length,
    });
    while (mi < matches.length) {
      const m = matches[mi];
      console.log("🔍 Processing match in loop:", m);
      ensureDateBar(m.matchedAt);

      const matchKey = `${m.message}-${m.matchedAt}`;
      const linkPreview = matchLinkPreviews[matchKey];

      console.log("🔍 Rendering match:", {
        message: m.message,
        matchKey,
        linkPreview,
        hasPreview: !!linkPreview,
      });

      result.push(
        <div
          key={`match-after-${mi}-${m.matchedAt}`}
          className="flex justify-center my-2"
        >
          <div
            className={`bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold max-w-[80%] ${
              isLinkMessage(m.message)
                ? "cursor-pointer hover:bg-orange-200 transition-colors"
                : ""
            }`}
            onClick={() => isLinkMessage(m.message) && handleMatchTap(m)}
          >
            <span className="text-orange-600 font-bold">マッチしたことば:</span>
            {linkPreview ? (
              // リンクプレビュー表示
              <div className="flex items-center gap-2 mt-1">
                {linkPreview.image ? (
                  <Image
                    src={linkPreview.image}
                    alt={linkPreview.title}
                    width={24}
                    height={24}
                    className="w-6 h-6 object-cover rounded border border-orange-200 flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove(
                        "hidden"
                      );
                    }}
                  />
                ) : null}
                <div
                  className={`w-6 h-6 rounded bg-orange-200 border border-orange-300 flex items-center justify-center text-orange-700 font-bold text-xs flex-shrink-0 ${
                    linkPreview.image ? "hidden" : ""
                  }`}
                >
                  URL
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-orange-700 truncate">
                    {linkPreview.title}
                  </p>
                  {(() => {
                    const urlAndText = extractUrlAndText(m.message);
                    return urlAndText && urlAndText.text ? (
                      <p className="text-xs text-orange-600 truncate mt-0.5">
                        {urlAndText.text}
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>
            ) : isLinkMessage(m.message) ? (
              // リンクメッセージだがプレビューがない場合（ローディング中など）
              <div className="mt-1 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin flex-shrink-0"></div>
                <span className="text-xs text-orange-600">
                  リンク情報を取得中...
                </span>
              </div>
            ) : (
              // 通常のメッセージ表示
              <div className="mt-1">「{m.message}」</div>
            )}
          </div>
        </div>
      );
      mi++;
    }
    return result;
  }

  if (isPreloading && messages.length === 0) {
    return (
      <div className="flex flex-col bg-white h-screen">
        <header className="sticky top-0 z-10 bg-white px-4 py-2 flex flex-col items-center">
          <button
            onClick={() => router.push("/chat-list")}
            className="absolute left-4 top-2 focus:outline-none"
          >
            <Image src="/icons/back.png" alt="Back" width={20} height={20} />
          </button>
          <h1 className="text-base font-bold text-black">読み込み中...</h1>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">チャットデータを読み込み中...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#f6f8fa] h-screen overflow-hidden w-screen">
      {/* ヘッダー：固定位置で常に表示 */}
      <header
        className="fixed left-0 right-0 bg-white px-4 py-3 flex items-center border-b z-50 shadow-sm"
        style={{
          top: "env(safe-area-inset-top, 0px)", // 常に画面上部に固定
        }}
      >
        <button
          onClick={() => router.push("/chat-list")}
          className="mr-3 focus:outline-none"
        >
          <Image src="/icons/back.png" alt="Back" width={24} height={24} />
        </button>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mr-2 shadow flex-shrink-0"
              style={{ backgroundColor: getBgColor(headerName) }}
            >
              {getInitials(headerName)}
            </div>
            <span className="text-base font-bold text-black truncate">
              {headerName}
            </span>
          </div>
          {!!matchMessage && (
            <div className="mt-1">
              {headerLinkPreview ? (
                // リンクプレビュー表示
                <div className="flex items-center gap-2">
                  {headerLinkPreview.image ? (
                    <Image
                      src={headerLinkPreview.image}
                      alt={headerLinkPreview.title}
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
                      headerLinkPreview.image ? "hidden" : ""
                    }`}
                  >
                    URL
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">
                      {headerLinkPreview.title}
                    </p>
                    {(() => {
                      const urlAndText = extractUrlAndText(matchMessage);
                      return urlAndText && urlAndText.text ? (
                        <p className="text-xs text-gray-500 truncate">
                          {urlAndText.text}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  {matchMessageMatchedAt && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(matchMessageMatchedAt).toLocaleTimeString(
                        "ja-JP",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                  )}
                </div>
              ) : isLinkMessage(matchMessage) ? (
                // リンクメッセージだがプレビューがない場合（ローディング中など）
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin flex-shrink-0"></div>
                  <span className="text-xs text-gray-500">
                    リンク情報を取得中...
                  </span>
                  {matchMessageMatchedAt && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(matchMessageMatchedAt).toLocaleTimeString(
                        "ja-JP",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                  )}
                </div>
              ) : (
                // 通常のメッセージ表示
                <span className="text-xs text-gray-500">
                  「{matchMessage}」
                  {matchMessageMatchedAt
                    ? ` / ${new Date(matchMessageMatchedAt).toLocaleTimeString(
                        "ja-JP",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}`
                    : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* メッセージ一覧：ヘッダーの下で自然にスクロール */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 scrollbar-hide"
        style={{
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          paddingTop: "calc(72px + env(safe-area-inset-top, 0px))", // ヘッダー高さ + safe-area
        }}
      >
        <div className="flex flex-col gap-0.5 py-2">
          {renderMessagesWithDate(messages)}
        </div>
      </main>

      {/* 入力欄：flexで下部に固定、safe-areaに対応 */}
      <footer
        className="flex-shrink-0 bg-white px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] flex items-end gap-3"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onInput={autoResizeTextarea}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="メッセージを入力"
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-green-400 bg-gray-50 text-base shadow-sm resize-none leading-6 transition-colors"
          style={{
            height: "auto",
            overflowY: "hidden",
            minHeight: "44px", // タップしやすい最小高さ
          }}
        />
        <button
          onClick={handleSend}
          className="p-3 rounded-2xl bg-green-400 hover:bg-green-500 active:bg-green-600 transition-colors shadow-lg active:scale-95 flex-shrink-0"
          disabled={isSending || !newMessage.trim()}
          aria-label="メッセージ送信"
          style={{
            minWidth: "52px",
            minHeight: "52px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            src={newMessage.trim() ? "/icons/send.png" : "/icons/message.png"}
            alt="Send"
            width={28}
            height={28}
          />
        </button>
      </footer>

      {/* リンク確認ポップアップ */}
      {showLinkConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              {showLinkConfirmModal.image ? (
                <Image
                  src={showLinkConfirmModal.image}
                  alt={showLinkConfirmModal.title}
                  width={64}
                  height={64}
                  className="w-16 h-16 object-cover rounded-xl border border-orange-200"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextElementSibling?.classList.remove(
                      "hidden"
                    );
                  }}
                />
              ) : null}
              <div
                className={`w-12 h-12 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs ${
                  showLinkConfirmModal.image ? "hidden" : ""
                }`}
              >
                {showLinkConfirmModal.image
                  ? "URL"
                  : showLinkConfirmModal.title &&
                    showLinkConfirmModal.title !== "Google Maps"
                  ? "🗺️"
                  : "URL"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">
                  {showLinkConfirmModal.title}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {showLinkConfirmModal.url}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  window.open(showLinkConfirmModal.url, "_blank");
                  setShowLinkConfirmModal(null);
                }}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition"
              >
                リンク先へ遷移
              </button>
              <button
                onClick={() => setShowLinkConfirmModal(null)}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 px-4 rounded-xl transition"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* エラー通知 */}
      <ErrorNotification
        isVisible={errorNotification.isVisible}
        message={errorNotification.message}
        onClose={() => setErrorNotification({ isVisible: false, message: "" })}
      />

      {/* 吹き出しのトゲ（LINE風） */}
      <style jsx global>{`
        .bubble-left::before {
          content: "";
          position: absolute;
          top: 12px;
          left: -8px;
          width: 16px;
          height: 16px;
          background: #fff;
          border-left: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          transform: rotate(45deg);
          border-radius: 4px;
          z-index: 0;
        }
        .bubble-right::before {
          content: "";
          position: absolute;
          top: 12px;
          right: -8px;
          width: 16px;
          height: 16px;
          background: #4ade80;
          transform: rotate(45deg);
          border-radius: 4px;
          z-index: 0;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
