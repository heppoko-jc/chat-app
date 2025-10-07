// app/chat/[chatId]/page.tsx

"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import socket from "../../socket";
import Image from "next/image";
import { useChatData } from "../../contexts/ChatDataContext";

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

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql =
    window.matchMedia && window.matchMedia("(display-mode: standalone)");
  const displayStandalone = mql ? mql.matches : false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return displayStandalone || !!nav.standalone;
}
function getVisualViewport(): VisualViewport | undefined {
  if (typeof window === "undefined") return undefined;
  return window.visualViewport ?? undefined; // null を undefined に正規化
}

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

  // ===== レイアウト参照 =====
  const mainRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // JS 推定のキーボード高さ(px)
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // UA の自動ズラし量(px) = visualViewport.offsetTop
  const [vvTop, setVvTop] = useState(0);

  // ベースライン（最初の visualViewport.height）
  const baseVvHeightRef = useRef<number | null>(null);
  // iOS PWA のスパイク平滑化
  const kbSamplesRef = useRef<number[]>([]);
  const currentKbRef = useRef<number>(0);

  // 受信重複ガード
  const seenIdsRef = useRef<Set<string>>(new Set());

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
  const scrollToBottom = useCallback(() => {
    const main = mainRef.current;
    if (!main) return;
    requestAnimationFrame(() => {
      main.scrollTop = main.scrollHeight;
    });
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

  // 一覧からヘッダー/マッチ履歴を初期化
  const chatInList = chatList?.find((c) => c.chatId === id);
  useEffect(() => {
    if (!chatInList) return;
    setMatchMessage(chatInList.matchMessage || "");
    setMatchMessageMatchedAt(chatInList.matchMessageMatchedAt || null);
    setMatchHistory(
      (chatInList.matchHistory || [])
        .slice()
        .sort(
          (a, b) =>
            new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
        )
    );
  }, [chatInList]);

  // ===== ルーム参加 & 受信購読（newMessage） =====
  useEffect(() => {
    if (!id || id.startsWith("dummy-")) return;
    socket.emit("joinChat", id);

    const upsertFromServer = (msg: Message) => {
      if (seenIdsRef.current.has(msg.id)) return;
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
        if (idx !== -1) next[idx] = formatted;
        else next.push(formatted);
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
                  ).toLocaleString("ja-JP", {
                    month: "2-digit",
                    day: "2-digit",
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
      if (payload.chatId !== id) return;
      upsertFromServer(payload.message);
    };

    socket.on("newMessage", handleNewMessage);
    return () => {
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

  // ===== 初回＆id変化時はサーバから最新を取得 =====
  useEffect(() => {
    if (!id || id.startsWith("dummy-")) return;
    let aborted = false;
    (async () => {
      try {
        const res = await axios.get<Message[]>(`/api/chat/${id}`);
        if (aborted) return;
        const formatted = res.data.map((msg) => ({
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleString("ja-JP", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
        }));
        formatted.forEach((m) => seenIdsRef.current.add(m.id));
        setMessages(formatted);
        setChatData((prev) => ({ ...prev, [id]: formatted }));
        scrollToBottom();
      } catch (e) {
        console.error("🚨 メッセージ取得エラー:", e);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [id, setChatData, scrollToBottom]);

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

  // ===== visualViewport で JS 側のキーボード高さを推定 + offsetTop を保持 =====
  const recomputeViewport = useCallback(() => {
    const vv = getVisualViewport();
    const layoutH = typeof window !== "undefined" ? window.innerHeight : 0;
    const vvH = vv?.height ?? layoutH;
    const top = vv?.offsetTop ?? 0;

    // 初回に基準値を記録
    if (baseVvHeightRef.current == null) {
      baseVvHeightRef.current = vvH;
    }

    // 生の KB 推定
    const kb1 = Math.max(0, layoutH - (vvH + top)); // overlay 正常系
    const base = baseVvHeightRef.current ?? layoutH;
    const kb2 = Math.max(0, base - vvH); // fallback
    let kbRaw = Math.round(Math.max(kb1, kb2));

    // iOS PWA のスパイク平滑化
    const isIOSDevice = isIOS();
    const isIOSStandalone = isStandalone();
    if (isIOSDevice && isIOSStandalone) {
      const MAX_KB_RATIO = 0.55;
      const MAX_KB_PX = 420;
      const HYSTERESIS_PX = 8;
      if (vvH > 0 && layoutH > 0) {
        const maxKb = Math.round(Math.min(layoutH * MAX_KB_RATIO, MAX_KB_PX));
        kbRaw = Math.min(Math.max(kbRaw, 0), maxKb);
      }
      const prev = currentKbRef.current;
      if (Math.abs(kbRaw - prev) < HYSTERESIS_PX) {
        // ほぼ変化なし → 早期 return してブレを抑制
        setVvTop(top);
        return;
      }
      kbSamplesRef.current.push(kbRaw);
      if (kbSamplesRef.current.length > 3) kbSamplesRef.current.shift();
      const sorted = [...kbSamplesRef.current].sort((a, b) => a - b);
      if (sorted.length >= 2) kbRaw = sorted[Math.floor(sorted.length / 2)];
    }

    currentKbRef.current = kbRaw;
    setKeyboardHeight(kbRaw);
    setVvTop(top);

    requestAnimationFrame(scrollToBottom);
  }, [scrollToBottom]);

  useEffect(() => {
    const vv = getVisualViewport();
    if (!vv) return;
    const handler = () => recomputeViewport();
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    recomputeViewport(); // 初期一発
    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
    };
  }, [recomputeViewport]);

  // テキスト変更時は自動リサイズ
  useEffect(() => {
    autoResizeTextarea();
  }, [newMessage, autoResizeTextarea]);

  // 入力欄フォーカス時（高さ確定後にボトムへ）
  const handleFocus = () => {
    setTimeout(() => {
      autoResizeTextarea();
      scrollToBottom();
    }, 0);
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
    setNewMessage("");

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

    try {
      const res = await axios.post<Message>(`/api/chat/${id}`, {
        senderId,
        content: contentToSend,
      });
      const saved = res.data;

      if (seenIdsRef.current.has(saved.id)) {
        setIsSending(false);
        setTimeout(() => inputRef.current?.focus(), 0); // キーボードは閉じない
        return;
      }

      seenIdsRef.current.add(saved.id);

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
          formattedDate: new Date(saved.createdAt).toLocaleString("ja-JP", {
            month: "2-digit",
            day: "2-digit",
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
          formattedDate: new Date(saved.createdAt).toLocaleString("ja-JP", {
            month: "2-digit",
            day: "2-digit",
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

  // ====== タイムライン描画 ======
  function renderMessagesWithDate(msgs: Message[]) {
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
      matches.forEach((m, idx) => {
        ensureDateBar(m.matchedAt);
        result.push(
          <div
            key={`match-only-${idx}-${m.matchedAt}`}
            className="flex justify-center my-2"
          >
            <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
              マッチしたことば: 「{m.message}」
            </span>
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
        result.push(
          <div
            key={`match-before-${mi}-${m.matchedAt}`}
            className="flex justify-center my-2"
          >
            <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
              マッチしたことば: 「{m.message}」
            </span>
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
          className={`flex items-end ${
            isMe ? "justify-end" : "justify-start"
          } w-full`}
        >
          {!isMe && (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-base mr-2 shadow"
              style={{ backgroundColor: getBgColor(msg.sender.name) }}
            >
              {getInitials(msg.sender.name)}
            </div>
          )}
          <div className="flex flex-col items-end max-w-[70%]">
            <div
              className={`relative px-4 py-2 text-sm rounded-2xl shadow-md ${
                isMe
                  ? "bg-green-400 text-white rounded-br-md bubble-right"
                  : "bg-white text-black rounded-bl-md bubble-left border border-gray-200"
              }`}
              style={{ wordBreak: "break-word", whiteSpace: "pre-wrap" }}
            >
              {msg.content}
            </div>
            <span
              className={`text-[10px] mt-1 ${
                isMe ? "text-green-500" : "text-gray-400"
              }`}
            >
              {msg.formattedDate}
            </span>
          </div>
        </div>
      );
    }

    while (mi < matches.length) {
      const m = matches[mi];
      ensureDateBar(m.matchedAt);
      result.push(
        <div
          key={`match-after-${mi}-${m.matchedAt}`}
          className="flex justify-center my-2"
        >
          <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
            マッチしたことば: 「{m.message}」
          </span>
        </div>
      );
      mi++;
    }
    return result;
  }

  // 入力エリアの基準スペース（KB 非表示時の下余白）
  const BASE_INPUT_BAR_SPACE_PX = 136;

  // ★ “二重持ち上げ” を避ける補正式
  //  - RAW: キーボード高さ（CSS env or JS）
  //  - CORR: max(0, RAW - vvTop) … UAのズレ分を差し引く
  const KB_RAW_EXPR = `max(env(keyboard-inset-height, 0px), var(--kb-js, 0px))`;
  const KB_CORR_EXPR = `max(0px, calc(${KB_RAW_EXPR} - var(--vv-top, 0px)))`;

  // CSS 変数注入（any 使わず型安全に）
  const cssVars: React.CSSProperties & Record<"--kb-js" | "--vv-top", string> =
    {
      ["--kb-js"]: `${keyboardHeight}px`,
      ["--vv-top"]: `${vvTop}px`,
    };

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
    <div className="flex flex-col bg-[#f6f8fa] h-screen overflow-x-hidden">
      {/* ヘッダー：UAズレ(vvTop)に追従して常に見える */}
      <header
        className="fixed left-0 right-0 z-10 bg-white px-4 py-3 flex items-center border-b"
        style={{ top: vvTop }}
      >
        <button
          onClick={() => router.push("/chat-list")}
          className="mr-3 focus:outline-none"
        >
          <Image src="/icons/back.png" alt="Back" width={24} height={24} />
        </button>
        <div className="flex flex-col">
          <div className="flex items-center">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mr-2 shadow"
              style={{ backgroundColor: getBgColor(headerName) }}
            >
              {getInitials(headerName)}
            </div>
            <span className="text-base font-bold text-black">{headerName}</span>
          </div>
          {!!matchMessage && (
            <span className="text-xs text-gray-500 mt-1">
              「{matchMessage}」
              {matchMessageMatchedAt
                ? ` / ${new Date(matchMessageMatchedAt).toLocaleString(
                    "ja-JP",
                    {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}`
                : ""}
            </span>
          )}
        </div>
      </header>

      {/* メッセージ一覧：入力バー分 + “補正後KB” 分の下余白 */}
      <main
        ref={mainRef}
        className="flex-1 px-2 pt-20 overflow-y-auto overflow-x-hidden scrollbar-hide"
        style={{
          ...cssVars,
          paddingBottom: `calc(${BASE_INPUT_BAR_SPACE_PX}px + ${KB_CORR_EXPR})`,
          overscrollBehavior: "contain",
        }}
      >
        <div className="flex flex-col gap-1 py-2">
          {renderMessagesWithDate(messages)}
        </div>
      </main>

      {/* 入力欄：下端にぴったり（safe-area + 補正後KB） */}
      <footer
        className="fixed left-0 right-0 bg-white px-4 py-4 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] flex items-center gap-3"
        style={{
          ...cssVars,
          bottom: `calc(env(safe-area-inset-bottom) + ${KB_CORR_EXPR})`,
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onInput={autoResizeTextarea}
          onFocus={handleFocus}
          placeholder="メッセージを入力"
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 focus:outline-none bg-gray-50 text-base shadow-sm resize-none leading-6"
          style={{ height: "auto", overflowY: "hidden" }}
        />
        <button
          onMouseDown={(e) => e.preventDefault()} // キーボードを閉じさせない
          onTouchStart={(e) => e.preventDefault()}
          onClick={handleSend}
          className="p-3 rounded-2xl bg-green-400 hover:bg-green-500 transition shadow-lg active:scale-95"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
          disabled={isSending || !newMessage.trim()}
          tabIndex={-1}
          aria-label="メッセージ送信"
        >
          <Image
            src={newMessage.trim() ? "/icons/send.png" : "/icons/message.png"}
            alt="Send"
            width={28}
            height={28}
          />
        </button>
      </footer>

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
