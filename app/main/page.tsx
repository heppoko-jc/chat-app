// app/main/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import Image from "next/image";
import FixedTabBar from "../components/FixedTabBar";
import { useRouter } from "next/navigation";
import { useChatData, PresetMessage } from "../contexts/ChatDataContext";
import MatchNotification from "../components/MatchNotification";
import socket, { setSocketUserId } from "../socket";
import type { ChatItem } from "../chat-list/page";

interface User {
  id: string;
  name: string;
  bio: string;
}
type ChatListApiItem = Omit<
  ChatItem,
  "latestMessageAtDisplay" | "latestMessageAtRaw"
> & {
  latestMessageAt: string | null;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
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

// 「最新順」：createdAt desc
const sortByNewest = (arr: PresetMessage[]) =>
  [...arr].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

// ── ポップアップ・キュー要素
type MatchQueueItem = {
  matchId?: string;
  matchedAt: string;
  message: string;
  matchedUser: { id: string; name: string };
  chatId?: string;
};

// ── キュー重複排除＋成立時刻昇順マージ（常に MatchQueueItem[] を返す）
const keyOf = (i: MatchQueueItem) =>
  `${i.matchId ?? ""}|${i.matchedUser.id}|${i.message}|${i.matchedAt}`;
const mergeQueue = (
  prev: MatchQueueItem[],
  incoming: MatchQueueItem[]
): MatchQueueItem[] => {
  const map = new Map<string, MatchQueueItem>();
  for (const p of prev) map.set(keyOf(p), p);
  for (const n of incoming) map.set(keyOf(n), n);
  return [...map.values()].sort(
    (a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
  );
};

export default function Main() {
  const router = useRouter();

  // ステート
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [lastSentMap, setLastSentMap] = useState<Record<string, string | null>>(
    {}
  );
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(
    []
  );
  const [isSent, setIsSent] = useState(false);
  const [matchCount, setMatchCount] = useState<number>(0);
  const [step, setStep] = useState<"select-message" | "select-recipients">(
    "select-message"
  );
  const [sentMessageInfo, setSentMessageInfo] = useState<{
    message: string;
    recipients: string[];
  } | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isInputMode, setIsInputMode] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const { presetMessages, setPresetMessages, setChatList } = useChatData();
  const [isSending, setIsSending] = useState(false);

  // ポップアップ・キュー
  const [matchQueue, setMatchQueue] = useState<MatchQueueItem[]>([]);
  const queueHead = matchQueue[0] ?? null;
  const isPopupVisible = !!queueHead;

  // localStorage の「最後に表示した matchedAt」キー
  const lastSeenKey = useMemo(
    () => (currentUserId ? `last-match-popup-seen-at-${currentUserId}` : null),
    [currentUserId]
  );

  // プリセットことば（最新順）
  const fetchPresetMessages = useCallback(async () => {
    try {
      const res = await axios.get<PresetMessage[]>("/api/preset-message");
      setPresetMessages(sortByNewest(res.data));
    } catch (e) {
      console.error("preset取得エラー:", e);
    }
  }, [setPresetMessages]);

  // チャットリスト
  const fetchChatList = useCallback(
    async (uid: string) => {
      try {
        const chatListResponse = await axios.get<ChatListApiItem[]>(
          "/api/chat-list",
          {
            headers: { userId: uid },
          }
        );
        const formattedChatList: ChatItem[] = chatListResponse.data
          .map(
            (c): ChatItem => ({
              ...c,
              latestMessageAtRaw: c.latestMessageAt ?? "",
              latestMessageAt: c.latestMessageAt
                ? new Date(c.latestMessageAt).toLocaleString("ja-JP", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
            })
          )
          .sort((a, b) => {
            const ta = a.latestMessageAtRaw
              ? new Date(a.latestMessageAtRaw).getTime()
              : 0;
            const tb = b.latestMessageAtRaw
              ? new Date(b.latestMessageAtRaw).getTime()
              : 0;
            return tb - ta;
          });
        setChatList(formattedChatList);
      } catch (error) {
        console.error("チャットリスト更新エラー:", error);
      }
    },
    [setChatList]
  );

  // 初期ロード
  useEffect(() => {
    const uid = localStorage.getItem("userId");
    setCurrentUserId(uid);

    if (uid) {
      axios
        .get<{ count: number }>("/api/match-message/count", {
          headers: { userId: uid },
        })
        .then((res) => setMatchCount(res.data.count))
        .catch((e) => console.error("件数取得エラー:", e));
    }

    axios
      .get<User[]>("/api/users")
      .then((res) => setUsers(res.data))
      .catch((e) => console.error("ユーザー取得エラー:", e));

    if (uid) {
      axios
        .get<{ userId: string; lastSentAt: string | null }[]>(
          "/api/users/last-sent",
          {
            headers: { userId: uid },
          }
        )
        .then((res) => {
          const map: Record<string, string | null> = {};
          res.data.forEach((row) => {
            map[row.userId] = row.lastSentAt;
          });
          setLastSentMap(map);
        })
        .catch((e) => console.error("last-sent 取得エラー:", e));
    }

    fetchPresetMessages();
    if (uid) fetchChatList(uid);
  }, [fetchPresetMessages, fetchChatList]);

  // 非表示中に溜まったマッチを取り込み（成立順でキューへ）
  const pullPendingMatches = useCallback(async () => {
    if (!currentUserId || !lastSeenKey) return;
    try {
      const since =
        localStorage.getItem(lastSeenKey) || "1970-01-01T00:00:00.000Z";
      const res = await axios.get<{ items: MatchQueueItem[] }>(
        `/api/match-pending?since=${encodeURIComponent(since)}`,
        { headers: { userId: currentUserId } }
      );
      if (Array.isArray(res.data.items) && res.data.items.length > 0) {
        const incoming = [...res.data.items].sort(
          (a, b) =>
            new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
        );
        setMatchQueue((prev) => mergeQueue(prev, incoming));
      }
    } catch (e) {
      console.error("未表示マッチの取得失敗:", e);
    }
  }, [currentUserId, lastSeenKey]);

  // 可視化時：再取得＋未表示マッチ取り込み（初回も即実行）
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchPresetMessages();
        const uid = localStorage.getItem("userId");
        if (uid) fetchChatList(uid);
        pullPendingMatches();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchPresetMessages, fetchChatList, pullPendingMatches]);

  // ソケット：両者に通知 → 即キューへ
  useEffect(() => {
    if (!currentUserId) return;
    setSocketUserId(currentUserId); // 再接続時の取りこぼし防止

    const handleMatchEstablished = (data: {
      matchId: string;
      chatId?: string;
      message: string;
      matchedAt: string;
      matchedUserId?: string;
      matchedUserName?: string;
      targetUserId?: string;
    }) => {
      // 自分宛のみ
      if (data.targetUserId && data.targetUserId !== currentUserId) return;

      if (data.matchedUserId && data.matchedUserName) {
        const item: MatchQueueItem = {
          matchId: data.matchId,
          matchedAt: data.matchedAt,
          message: data.message,
          matchedUser: { id: data.matchedUserId, name: data.matchedUserName },
          chatId: data.chatId,
        };
        setMatchQueue((prev) => mergeQueue(prev, [item]));
      }

      // 表示情報の同期
      fetchPresetMessages();
      fetchChatList(currentUserId);
    };

    socket.on("matchEstablished", handleMatchEstablished);
    return () => {
      socket.off("matchEstablished", handleMatchEstablished);
    };
  }, [currentUserId, fetchPresetMessages, fetchChatList]);

  // スワイプ（JSXで使う）
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX === null) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const SWIPE_THRESHOLD = 100;
      if (deltaX < -SWIPE_THRESHOLD && step === "select-message")
        setStep("select-recipients");
      else if (deltaX > SWIPE_THRESHOLD && step === "select-recipients")
        setStep("select-message");
      setTouchStartX(null);
    },
    [touchStartX, step]
  );

  const handleHistoryNavigation = () => router.push("/notifications");

  const handleSelectMessage = (msg: string) => {
    setSelectedMessage((prev) => (prev === msg ? null : msg));
    setInputMessage("");
  };
  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // 表示用：count>0 & 「最新順」
  const messageOptions = presetMessages
    .filter((m) => (m.count ?? 0) > 0)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const handleMessageIconClick = () => {
    if (isInputMode && inputMessage.trim()) {
      setSelectedMessage(inputMessage.trim());
      setIsInputMode(false);
      setStep("select-recipients");
    } else if (selectedMessage) {
      setStep("select-recipients");
    }
  };

  // 送信
  const handleSend = async () => {
    if (!selectedMessage) return;
    if (selectedRecipientIds.length === 0) {
      setStep("select-recipients");
      return;
    }
    if (!currentUserId || isSending) return;

    setIsSending(true);
    setSentMessageInfo({
      message: selectedMessage,
      recipients: [...selectedRecipientIds],
    });
    setIsSent(true);

    const messageToSend = selectedMessage;
    const recipientsToSend = [...selectedRecipientIds];

    // UI リセット
    setSelectedMessage(null);
    setSelectedRecipientIds([]);
    setStep("select-message");
    setIsInputMode(false);
    setInputMessage("");

    try {
      const isPreset = presetMessages.some(
        (m) => m.content === messageToSend && (m.count ?? 0) > 0
      );
      if (!isPreset) {
        const res = await fetch("/api/preset-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: messageToSend,
            createdBy: currentUserId,
          }),
        });
        if (res.ok) {
          const created: PresetMessage = await res.json();
          setPresetMessages((prev) =>
            sortByNewest([{ ...created, count: 1 }, ...prev])
          );
        } else {
          alert("ことばの登録に失敗しました");
          setIsSending(false);
          setIsSent(false);
          setSentMessageInfo(null);
          return;
        }
      } else {
        setPresetMessages((prev) =>
          sortByNewest(
            prev.map((m) =>
              m.content === messageToSend
                ? { ...m, count: (m.count ?? 0) + 1 }
                : m
            )
          )
        );
      }

      const matchResponse = await axios.post("/api/match-message", {
        senderId: currentUserId,
        receiverIds: recipientsToSend,
        message: messageToSend,
      });

      // 成立 → 自分側も即キューに積む（後送/先送どちらでも）
      if (matchResponse.data.message === "Match created!") {
        const matchedUserId = recipientsToSend.find(
          (id) => matchResponse.data.matchedUserId === id
        );
        if (matchedUserId) {
          const matchedUser = users.find((u) => u.id === matchedUserId);
          if (matchedUser) {
            const selfItem: MatchQueueItem = {
              matchedAt: new Date().toISOString(),
              message: messageToSend,
              matchedUser: { id: matchedUser.id, name: matchedUser.name },
              chatId: matchResponse.data.chatId,
            };
            setMatchQueue((prev) => mergeQueue(prev, [selfItem]));
          }
        }
        await Promise.all([
          fetchPresetMessages(),
          fetchChatList(currentUserId),
        ]);
      }

      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setTimeout(() => {
        setIsSent(false);
        setSentMessageInfo(null);
      }, 4000);
    } catch (error) {
      console.error("送信エラー:", error);
      alert("メッセージの送信に失敗しました");
      setIsSent(false);
      setSentMessageInfo(null);
    } finally {
      setIsSending(false);
    }
  };

  const canSend = !!selectedMessage && selectedRecipientIds.length > 0;

  // レイアウト定数
  const HEADER_H = 132;
  const GAP_AFTER_HEADER = 8;
  const SEND_BAR_TOTAL_H = 80;
  const SEND_BAR_TOP = HEADER_H + GAP_AFTER_HEADER;
  const LIST_PT = SEND_BAR_TOP + SEND_BAR_TOTAL_H + 20;

  // ポップアップを閉じたとき：先頭を剥がし、しきい値を進める
  const handleClosePopup = useCallback(() => {
    if (!queueHead) return;
    setMatchQueue((prev) => prev.slice(1));
    if (lastSeenKey) {
      const prevSeen = localStorage.getItem(lastSeenKey);
      const maxSeen = [
        prevSeen ?? "1970-01-01T00:00:00.000Z",
        queueHead.matchedAt,
      ]
        .sort()
        .slice(-1)[0];
      localStorage.setItem(lastSeenKey, maxSeen);
    }
  }, [queueHead, lastSeenKey]);

  return (
    <>
      {/* ヘッダー（高さ拡張） */}
      <div
        className="fixed top-0 left-0 w-full bg-gradient-to-b from-white via-orange-50 to-orange-100 z-20 px-6 pt-6 pb-3 flex flex-col items-center shadow-md rounded-b-3xl"
        style={{ minHeight: HEADER_H, height: HEADER_H }}
      >
        <div className="flex w-full justify-between items-center mb-2">
          <div className="w-20 flex items-center">
            <button
              onClick={handleHistoryNavigation}
              className="transition-transform duration-200 ease-out active:scale-125 focus:outline-none rounded-full p-2"
            >
              <Image
                src="/icons/history.png"
                alt="Notifications"
                width={28}
                height={28}
                className="cursor-pointer"
              />
            </button>
          </div>
          <h1
            className="text-xl font-extrabold text-orange-500 tracking-tight drop-shadow-sm whitespace-nowrap"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Happy Ice Cream
          </h1>
          <div className="w-20" />
        </div>

        <p className="text-[15px] text-gray-700 text-center leading-snug mt-1 font-medium">
          同じことばを送り合ってマッチできるかな？
          <br />
          あなたは現在、マッチの可能性が
          <span className="text-orange-500 font-bold mx-1">{matchCount}</span>
          件あります
          {/* 取り消されたメッセージは自動的に除外される */}
        </p>
      </div>

      {/* 送信待機バー（ヘッダー直下より少し下） */}
      <div
        className={`fixed left-6 right-6 z-30 py-2 flex items-center h-16 px-3 shadow-lg rounded-2xl border border-orange-200 transition-all duration-200
          ${
            canSend
              ? "bg-gradient-to-r from-orange-400 to-orange-300"
              : selectedMessage || selectedRecipientIds.length > 0
              ? "bg-gradient-to-r from-orange-200 to-orange-100"
              : "bg-orange-50"
          }
        `}
        style={{ top: `${SEND_BAR_TOP}px` }}
      >
        <div className="flex-1 flex flex-col justify-between h-full overflow-x-auto pr-2">
          {!selectedMessage ||
          !messageOptions.some((m) => m.content === selectedMessage) ? (
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Aa..."
              className="flex-1 px-3 py-2 rounded-xl border border-orange-200 text-base bg-white shadow-sm focus:ring-2 focus:ring-orange-200 outline-none transition"
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputMessage.trim()) {
                  setSelectedMessage(inputMessage.trim());
                  setIsInputMode(false);
                  setStep("select-recipients");
                }
              }}
              onBlur={() => {
                if (inputMessage.trim()) {
                  setSelectedMessage(inputMessage.trim());
                  setIsInputMode(false);
                  setStep("select-recipients");
                }
              }}
            />
          ) : (
            <span
              onClick={() => setSelectedMessage(null)}
              className="px-3 py-2 rounded-xl font-bold cursor-pointer bg白/80 text-orange-600 shadow border border-orange-200 hover:bg-orange-100 transition"
            >
              {selectedMessage}
            </span>
          )}
          <div className="flex overflow-x-auto whitespace-nowrap scrollbar-hide mt-1">
            {selectedRecipientIds.length > 0 ? (
              selectedRecipientIds.map((id, idx) => {
                const u = users.find((u) => u.id === id);
                return (
                  <span
                    key={id}
                    onClick={() => toggleRecipient(id)}
                    className="inline-block mr-1 font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded-xl shadow cursor-pointer hover:bg-orange-200 transition"
                  >
                    {u?.name}
                    {idx < selectedRecipientIds.length - 1 ? "," : ""}
                  </span>
                );
              })
            ) : (
              <span className="text-orange-300">誰に送る？</span>
            )}
          </div>
        </div>

        {selectedRecipientIds.length > 0 && (
          <span className="ml-2 px-2 py-1 rounded-full bg-orange-400 text-white text-xs font-bold shadow border border-orange-200 select-none">
            {selectedRecipientIds.length}人
          </span>
        )}

        <button
          onClick={canSend ? handleSend : handleMessageIconClick}
          className="flex-none px-1 py-1 transition-transform duration-200 ease-out active:scale-125 focus:outline-none rounded-full bg-white/80 hover:bg-orange-100 shadow border border-orange-200"
          disabled={isSending}
          style={{ minWidth: 36, minHeight: 36 }}
        >
          <Image
            src={canSend ? "/icons/send.png" : "/icons/message.png"}
            alt="send"
            width={28}
            height={28}
          />
        </button>
      </div>

      {/* コンテンツ（スワイプ可能） */}
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden bg-orange-50"
        style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex w-full h-full transition-transform duration-300 will-change-transform"
          style={{
            transform:
              step === "select-message"
                ? "translateX(0%)"
                : "translateX(-100%)",
          }}
        >
          {/* メッセージ選択（最新順） */}
          <div
            className="basis-full flex-none box-border text-lg overflow-y-auto px-4 pb-[40px]"
            style={{
              maxHeight: "calc(100dvh - 160px)",
              paddingTop: `${LIST_PT}px`,
            }}
          >
            <div className="flex flex-col gap-3">
              {messageOptions.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg.content)}
                  className={`w-full flex justify-between items-center text-left px-5 py-3 rounded-3xl shadow-md border border-orange-100 hover:bg-orange-100 active:scale-95 font-medium text-base ${
                    selectedMessage === msg.content
                      ? "font-bold text-orange-700 bg-orange-200 border-orange-300 shadow-lg"
                      : "text-gray-700 bg-white"
                  }`}
                  style={{
                    backgroundColor:
                      selectedMessage === msg.content ? "#fed7aa" : "#ffffff",
                    borderColor:
                      selectedMessage === msg.content ? "#ea580c" : "#fed7aa",
                  }}
                >
                  <span className="whitespace-pre-wrap break-words">
                    {msg.content}
                  </span>
                  <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                    {msg.count}人がシェアしました
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 送信先選択 */}
          <div
            className="basis-full flex-none box-border text-lg overflow-y-auto px-4 pb-[40px]"
            style={{
              maxHeight: "calc(100dvh - 160px)",
              paddingTop: `${LIST_PT}px`,
            }}
          >
            <div className="flex flex-col gap-2">
              {users
                .filter((u) => u.id !== currentUserId)
                .slice()
                .sort((a, b) => {
                  const la = lastSentMap[a.id];
                  const lb = lastSentMap[b.id];
                  // 1) どちらも送信履歴あり → 新しい順
                  if (la && lb)
                    return new Date(lb).getTime() - new Date(la).getTime();
                  // 2) 片方のみ履歴あり → 履歴ありを前へ
                  if (la && !lb) return -1;
                  if (!la && lb) return 1;
                  // 3) 両方なし → 名前の五十音順（localeCompare）
                  return a.name.localeCompare(b.name, "ja");
                })
                .map((u) => (
                  <div
                    key={u.id}
                    onClick={() => toggleRecipient(u.id)}
                    className={`flex items-center gap-3 p-3 rounded-3xl shadow-md border border-orange-100 hover:bg-orange-100 active:scale-95 cursor-pointer ${
                      selectedRecipientIds.includes(u.id)
                        ? "bg-orange-200 border-orange-300 shadow-lg"
                        : "bg-white"
                    }`}
                    style={{
                      backgroundColor: selectedRecipientIds.includes(u.id)
                        ? "#fed7aa"
                        : "#ffffff",
                      borderColor: selectedRecipientIds.includes(u.id)
                        ? "#ea580c"
                        : "#fed7aa",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow"
                      style={{ backgroundColor: getBgColor(u.name) }}
                    >
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-lg truncate ${
                          selectedRecipientIds.includes(u.id)
                            ? "font-bold text-orange-700"
                            : "text-gray-700"
                        }`}
                      >
                        {u.name}
                      </p>
                    </div>
                    {selectedRecipientIds.includes(u.id) && (
                      <Image
                        src="/icons/check.png"
                        alt="Selected"
                        width={20}
                        height={20}
                      />
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </main>

      {/* リスト切替トグル */}
      <div
        className="固定 left-4 right-4 z-30 bg-white py-2 px-4 rounded-3xl shadow-lg border border-orange-200"
        style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
      >
        <div className="relative flex">
          <span
            className="absolute top-0 bottom-0 w-1/2 bg-orange-100 rounded-3xl transition-transform duration-300"
            style={{
              transform:
                step === "select-message"
                  ? "translateX(0%)"
                  : "translateX(100%)",
            }}
          />
          <button
            onClick={() => setStep("select-message")}
            className={`relative z-10 flex-1 py-2 text-center text-base font-bold rounded-3xl transition text-orange-600 ${
              step === "select-message" ? "bg-orange-200 shadow" : ""
            }`}
          >
            ことばリスト
          </button>
          <button
            onClick={() => setStep("select-recipients")}
            className={`relative z-10 flex-1 py-2 text-center text-base font-bold rounded-3xl transition text-orange-600 ${
              step === "select-recipients" ? "bg-orange-200 shadow" : ""
            }`}
          >
            ともだちリスト
          </button>
        </div>
      </div>

      {/* 送信成功メッセージ */}
      {isSent && sentMessageInfo && (
        <div className="fixed top-[50px] left-0 right-0 z-30 overflow-hidden px-2 neon-gradient">
          <div className="w-max whitespace-nowrap animate-slide-in font-bold text-white text-lg px-4 py-2 shadow-lg">
            「{sentMessageInfo.message}」が
            {sentMessageInfo.recipients
              .map((id) => users.find((u) => u.id === id)?.name)
              .filter(Boolean)
              .join(", ")}
            にシェアされました！
          </div>
        </div>
      )}

      {/* マッチ通知（キュー先頭だけ表示） */}
      <MatchNotification
        isVisible={isPopupVisible}
        onClose={handleClosePopup}
        matchedUser={queueHead?.matchedUser ?? undefined}
        message={queueHead?.message ?? undefined}
      />

      <FixedTabBar />
    </>
  );
}
