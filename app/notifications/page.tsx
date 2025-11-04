// app/notifications/page.tsx
"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Image from "next/image";

// ──────────── 型定義 ────────────
interface SentMessage {
  id: string;
  receiver: { id: string; name: string };
  message: string;
  linkTitle?: string;
  linkImage?: string;
  createdAt: string;
  isMatched: boolean;
  isExpired?: boolean;
}

interface ApiResponse {
  sentMessages: SentMessage[];
}

// ──────────── ユーティリティ関数 ────────────
function getBgColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = hash % 360;
  return `hsl(${h}, 70%, 80%)`;
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
function formatDate(iso: string) {
  if (isToday(iso)) return "";
  const d = new Date(iso);
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const hh = d.getHours();
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${M}/${D} ${hh}:${mm}`;
}

export default function Notifications() {
  const router = useRouter();

  // ──────────── ステート管理 ────────────
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [cancelPopup, setCancelPopup] = useState<SentMessage | null>(null);
  const [cancelGroupPopup, setCancelGroupPopup] = useState<
    SentMessage[] | null
  >(null);
  const [animateExit, setAnimateExit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [linkPopup, setLinkPopup] = useState<SentMessage | null>(null);

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null
  );

  // セクション分割（未マッチ／マッチ済み）
  const { unmatchedMessages, matchedMessages } = useMemo(() => {
    const unmatched = sentMessages.filter((m) => !m.isMatched);
    const matched = sentMessages.filter((m) => m.isMatched);
    return { unmatchedMessages: unmatched, matchedMessages: matched };
  }, [sentMessages]);

  // ──────────── "同時送信"グルーピング ────────────
  type Group = {
    key: string; // message + baseTime でユニーク化
    message: string;
    linkTitle?: string;
    linkImage?: string;
    createdAtBase: string; // グループ基準時刻（最初の要素）
    items: SentMessage[];
    isMatchedBlock: boolean; // セクション識別
  };

  // 許容ウィンドウ（秒）
  const SAME_WINDOW_SEC = 5;

  const toSec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

  const groupBySimultaneous = useCallback(
    (list: SentMessage[], isMatchedBlock: boolean): Group[] => {
      if (list.length === 0) return [];
      // createdAt desc で並んでいる前提。異なるならここでソート
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const groups: Group[] = [];
      let current: Group | null = null;

      for (const m of sorted) {
        if (
          current &&
          current.message === m.message &&
          Math.abs(toSec(current.createdAtBase) - toSec(m.createdAt)) <=
            SAME_WINDOW_SEC
        ) {
          current.items.push(m);
        } else {
          if (current) groups.push(current);
          current = {
            key: `${m.message}|${m.createdAt}`,
            message: m.message,
            linkTitle: m.linkTitle,
            linkImage: m.linkImage,
            createdAtBase: m.createdAt,
            items: [m],
            isMatchedBlock,
          };
        }
      }
      if (current) groups.push(current);
      return groups;
    },
    []
  );

  const unmatchedGroups = useMemo(
    () => groupBySimultaneous(unmatchedMessages, false),
    [unmatchedMessages, groupBySimultaneous]
  );
  const matchedGroups = useMemo(
    () => groupBySimultaneous(matchedMessages, true),
    [matchedMessages, groupBySimultaneous]
  );

  // トグル開閉状態
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  // ──────────── データ取得 ────────────
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setIsLoading(true);
        const res = await axios.get<ApiResponse>(
          `/api/notifications?userId=${userId}`
        );
        // すべて保持（未マッチのみでフィルタしない）
        setSentMessages(res.data.sentMessages);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [userId]);

  // ──────────── リンクをクリックした時の処理 ────────────
  const handleMessageClick = (msg: SentMessage) => {
    // リンクメッセージの場合はポップアップを表示
    if (msg.linkTitle || msg.linkImage) {
      setLinkPopup(msg);
    }
    // 通常のメッセージの場合は何もしない
  };

  const handleOpenLink = () => {
    if (!linkPopup) return;
    // URLを抽出
    const urlMatch = linkPopup.message.match(/^(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      window.open(urlMatch[1], "_blank");
    }
    setLinkPopup(null);
  };

  // ──────────── 画面スワイプで戻る ────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.time;
    const DIST = 30,
      SPEED = 0.3,
      ANGLE = 2;
    const isHorz =
      Math.abs(dx) > DIST &&
      Math.abs(dx / dy) > ANGLE &&
      Math.abs(dx) / dt > SPEED;
    if (isHorz && dx > 0) {
      setAnimateExit(true);
      setTimeout(() => router.push("/main"), 300);
    }
    touchStart.current = null;
  };

  // ──────────── UI ────────────
  return (
    <div
      className={`
        flex flex-col h-[100dvh] pt-1 px-5 pb-5 max-w-md mx-auto overflow-hidden
        ${animateExit ? "animate-slide-out-left" : "animate-slide-in-left"}
      `}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ─── 固定ヘッダー ─── */}
      <div className="sticky top-0 z-20 bg-white pb-4">
        <div className="relative flex items-center justify-center py-4">
          <button
            onClick={() => {
              setAnimateExit(true);
              setTimeout(() => router.push("/main"), 300);
            }}
            className="absolute right-5 transition-transform duration-200 ease-out active:scale-150"
          >
            <Image
              src="/icons/back.png"
              alt="Back"
              width={21}
              height={21}
              className="rotate-180"
            />
          </button>
          <h1 className="text-2xl font-bold mt-1">History</h1>
        </div>
        <h2 className="text-sm text-center">
          ことばをシェアした履歴です。
          <br />
          右のボタンから取り消すこともできます（未マッチのみ）。
        </h2>
      </div>

      {/* ─── スクロール可能領域 ─── */}
      <div className="flex-1 overflow-y-auto space-y-6 pb-4">
        {/* ローディング */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="text-gray-500 font-medium">読み込み中…</p>
          </div>
        ) : (
          <>
            {/* どちらも 0 件 */}
            {unmatchedMessages.length === 0 && matchedMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl">📝</span>
                </div>
                <p className="text-center text-gray-500">
                  まだことばをシェアしたことがありません。
                </p>
              </div>
            ) : (
              <>
                {/* ─── 未マッチセクション ─── */}
                {unmatchedMessages.length > 0 && (
                  <section>
                    <h3 className="text-lg font-bold text-gray-800 mb-3">
                      まだマッチしてないことば
                    </h3>
                    <ul className="space-y-3">
                      {unmatchedGroups.map((g) => {
                        const isMulti = g.items.length > 1;
                        const isOpen = !!openGroups[g.key];
                        const first = g.items[0];
                        return (
                          <li key={g.key} className="list-none">
                            {/* ヘッダー行（トグルボタン） */}
                            <button
                              onClick={() =>
                                isMulti
                                  ? toggleGroup(g.key)
                                  : handleMessageClick(first)
                              }
                              className="
                                w-full flex items-center justify-between p-3
                                bg-white shadow rounded-3xl
                                transition-all duration-300 ease-out active:scale-95
                                text-left
                              "
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div
                                  className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                                  style={{
                                    backgroundColor: getBgColor(
                                      first.receiver.name
                                    ),
                                  }}
                                >
                                  {first.receiver.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate">
                                    {isMulti
                                      ? `To ${first.receiver.name} ほか${
                                          g.items.length - 1
                                        }人`
                                      : `To ${first.receiver.name}`}
                                  </p>

                                  {g.linkTitle || g.linkImage ? (
                                    <div className="flex items-start gap-2 mt-1">
                                      {g.linkImage ? (
                                        <Image
                                          src={g.linkImage}
                                          alt={g.linkTitle || g.message}
                                          width={48}
                                          height={48}
                                          className="w-12 h-12 object-cover rounded-lg border border-orange-200 flex-shrink-0"
                                          onError={(e) => {
                                            e.currentTarget.style.display =
                                              "none";
                                            e.currentTarget.nextElementSibling?.classList.remove(
                                              "hidden"
                                            );
                                          }}
                                        />
                                      ) : null}
                                      <div
                                        className={`w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0 ${
                                          g.linkImage ? "hidden" : ""
                                        }`}
                                      >
                                        URL
                                      </div>
                                      <div className="flex-1 min-w-0 overflow-hidden">
                                        {g.linkTitle &&
                                        (g.message.includes(" ") ||
                                          g.message.includes("　") ||
                                          g.message.match(
                                            /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%].+)$/
                                          )) ? (
                                          <>
                                            <p className="text-sm font-bold text-gray-800">
                                              {g.linkTitle}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate mt-1">
                                              {g.message
                                                .replace(
                                                  /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/,
                                                  ""
                                                )
                                                .trim()}
                                            </p>
                                          </>
                                        ) : (
                                          <>
                                            <p className="text-sm font-bold text-gray-800">
                                              {g.linkTitle || g.message}
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-medium whitespace-normal break-words mt-1">
                                      {g.message}
                                    </p>
                                  )}

                                  <div className="flex items-center justify-end gap-2 mt-2">
                                    {formatDate(g.createdAtBase) && (
                                      <span className="text-xs text-gray-500 whitespace-nowrap">
                                        {formatDate(g.createdAtBase)}
                                      </span>
                                    )}
                                    {g.items.some((m) => m.isExpired) && (
                                      <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600 font-semibold whitespace-nowrap">
                                        24時間期限切れ
                                      </span>
                                    )}
                                    {isMulti && (
                                      <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700 font-semibold whitespace-nowrap">
                                        同時に{g.items.length}人
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isMulti && (
                                  <div className="text-gray-500 text-sm">
                                    {isOpen ? "▲" : "▼"}
                                  </div>
                                )}
                                <div className="flex-none shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isMulti) {
                                        setCancelGroupPopup(g.items);
                                      } else {
                                        setCancelPopup(first);
                                      }
                                    }}
                                    className="p-2 transition-transform duration-200 ease-out active:scale-90"
                                    aria-label="more"
                                  >
                                    <Image
                                      src="/icons/more.png"
                                      alt="More"
                                      width={18}
                                      height={18}
                                    />
                                  </button>
                                </div>
                              </div>
                            </button>

                            {/* 明細（展開時のみ） */}
                            {isMulti && isOpen && (
                              <ul className="mt-2 space-y-2 pl-3">
                                {g.items.map((m) => (
                                  <li
                                    key={m.id}
                                    onClick={() => handleMessageClick(m)}
                                    className="list-none flex items-center justify-between p-3 bg-white shadow rounded-2xl active:scale-95 transition cursor-pointer"
                                  >
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                        style={{
                                          backgroundColor: getBgColor(
                                            m.receiver.name
                                          ),
                                        }}
                                      >
                                        {m.receiver.name.charAt(0)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">
                                          To {m.receiver.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                          {formatDate(m.createdAt) && (
                                            <span className="text-xs text-gray-500">
                                              {formatDate(m.createdAt)}
                                            </span>
                                          )}
                                          {m.isExpired && (
                                            <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600 font-semibold">
                                              24時間期限切れ
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex-none shrink-0 ml-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCancelPopup(m);
                                        }}
                                        className="p-2 transition-transform duration-200 ease-out active:scale-90"
                                        aria-label="more"
                                      >
                                        <Image
                                          src="/icons/more.png"
                                          alt="More"
                                          width={18}
                                          height={18}
                                        />
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {/* ─── マッチ済みセクション ─── */}
                {matchedMessages.length > 0 && (
                  <section>
                    <h3 className="text-lg font-bold text-gray-800 mb-3">
                      マッチしたことば
                    </h3>
                    <ul className="space-y-3">
                      {matchedGroups.map((g) => {
                        const isMulti = g.items.length > 1;
                        const isOpen = !!openGroups[g.key];
                        const first = g.items[0];
                        return (
                          <li key={g.key} className="list-none">
                            <button
                              onClick={() =>
                                isMulti
                                  ? toggleGroup(g.key)
                                  : handleMessageClick(first)
                              }
                              className="
                                w-full flex items-center justify-between p-3
                                bg-white shadow rounded-3xl
                                transition-all duration-300 ease-out active:scale-95
                                text-left
                              "
                            >
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <div
                                  className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                                  style={{
                                    backgroundColor: getBgColor(
                                      first.receiver.name
                                    ),
                                  }}
                                >
                                  {first.receiver.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate">
                                    {isMulti
                                      ? `To ${first.receiver.name} ほか${
                                          g.items.length - 1
                                        }人`
                                      : `To ${first.receiver.name}`}
                                  </p>

                                  {g.linkTitle || g.linkImage ? (
                                    <div className="flex items-start gap-2 mt-1">
                                      {g.linkImage ? (
                                        <Image
                                          src={g.linkImage}
                                          alt={g.linkTitle || g.message}
                                          width={48}
                                          height={48}
                                          className="w-12 h-12 object-cover rounded-lg border border-orange-200 flex-shrink-0"
                                          onError={(e) => {
                                            e.currentTarget.style.display =
                                              "none";
                                            e.currentTarget.nextElementSibling?.classList.remove(
                                              "hidden"
                                            );
                                          }}
                                        />
                                      ) : null}
                                      <div
                                        className={`w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0 ${
                                          g.linkImage ? "hidden" : ""
                                        }`}
                                      >
                                        URL
                                      </div>
                                      <div className="flex-1 min-w-0 overflow-hidden">
                                        {g.linkTitle &&
                                        (g.message.includes(" ") ||
                                          g.message.includes("　") ||
                                          g.message.match(
                                            /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%].+)$/
                                          )) ? (
                                          <>
                                            <p className="text-sm font-bold text-gray-800">
                                              {g.linkTitle}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate mt-1">
                                              {g.message
                                                .replace(
                                                  /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/,
                                                  ""
                                                )
                                                .trim()}
                                            </p>
                                          </>
                                        ) : (
                                          <>
                                            <p className="text-sm font-bold text-gray-800">
                                              {g.linkTitle || g.message}
                                            </p>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-medium whitespace-normal break-words mt-1">
                                      {g.message}
                                    </p>
                                  )}

                                  <div className="flex items-center justify-end gap-2 mt-2">
                                    {formatDate(g.createdAtBase) && (
                                      <span className="text-xs text-gray-500 whitespace-nowrap">
                                        {formatDate(g.createdAtBase)}
                                      </span>
                                    )}
                                    {g.items.some((m) => m.isExpired) && (
                                      <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600 font-semibold whitespace-nowrap">
                                        24時間期限切れ
                                      </span>
                                    )}
                                    {isMulti && (
                                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold whitespace-nowrap">
                                        同時に{g.items.length}人（マッチ済）
                                      </span>
                                    )}
                                    {!isMulti && (
                                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-600 font-semibold">
                                        マッチ済
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {isMulti && (
                                <div className="ml-3 text-gray-500 text-sm">
                                  {isOpen ? "▲" : "▼"}
                                </div>
                              )}
                            </button>

                            {isMulti && isOpen && (
                              <ul className="mt-2 space-y-2 pl-3">
                                {g.items.map((m) => (
                                  <li
                                    key={m.id}
                                    onClick={() => handleMessageClick(m)}
                                    className="list-none flex items-center justify-between p-3 bg-white shadow rounded-2xl active:scale-95 transition cursor-pointer"
                                  >
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
                                        style={{
                                          backgroundColor: getBgColor(
                                            m.receiver.name
                                          ),
                                        }}
                                      >
                                        {m.receiver.name.charAt(0)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate">
                                          To {m.receiver.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                          {formatDate(m.createdAt) && (
                                            <span className="text-xs text-gray-500">
                                              {formatDate(m.createdAt)}
                                            </span>
                                          )}
                                          {m.isExpired && (
                                            <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600 font-semibold">
                                              24時間期限切れ
                                            </span>
                                          )}
                                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-600 font-semibold">
                                            マッチ済
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ─── 取り消し確認ポップアップ（未マッチのみ表示） ─── */}
      {cancelPopup && !cancelPopup.isMatched && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white p-5 rounded-3xl shadow-lg w-11/12 max-w-sm">
            <h3 className="text-lg font-bold mb-2">シェアの取り消し</h3>
            <p className="mb-1">
              <strong>To:</strong> {cancelPopup.receiver.name}
            </p>
            <p className="mb-1">
              <strong>Message:</strong> {cancelPopup.message}
            </p>
            <p className="text-sm text-red-500 mb-2">
              一度取り消すと、復元できません。
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={async () => {
                  const id = cancelPopup.id;
                  setCancelPopup(null);
                  try {
                    await axios.delete("/api/cancel-message", {
                      data: { messageId: id, senderId: userId },
                    });
                    setSentMessages((prev) => prev.filter((m) => m.id !== id));

                    // サーバー側でカウントが適切に管理されるため、
                    // フロントエンド側での手動調整は不要
                  } catch {
                    alert("取り消しに失敗しました");
                  }
                }}
                className="
                  bg-red-500 text-white px-6 py-2 rounded-3xl hover:bg-red-600
                  transition-transform duration-200 ease-out active:scale-90
                "
              >
                取り消す
              </button>
              <button
                onClick={() => setCancelPopup(null)}
                className="
                  bg-gray-500 text-white px-6 py-2 rounded-3xl hover:bg-gray-600
                  transition-transform duration-200 ease-out active:scale-90
                "
              >
                もどる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── グループ取り消し確認ポップアップ（未マッチのみ表示） ─── */}
      {cancelGroupPopup &&
        cancelGroupPopup.length > 0 &&
        !cancelGroupPopup[0].isMatched && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
            <div className="bg-white p-5 rounded-3xl shadow-lg w-11/12 max-w-sm">
              <h3 className="text-lg font-bold mb-2">シェアの取り消し</h3>
              <p className="mb-1">
                <strong>件数:</strong> {cancelGroupPopup.length}件
              </p>
              <p className="mb-1">
                <strong>Message:</strong> {cancelGroupPopup[0].message}
              </p>
              <p className="mb-2 text-sm text-gray-600">
                <strong>To:</strong>{" "}
                {cancelGroupPopup.map((m) => m.receiver.name).join(", ")}
              </p>
              <p className="text-sm text-red-500 mb-2">
                一度取り消すと、復元できません。
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={async () => {
                    const ids = cancelGroupPopup.map((m) => m.id);
                    setCancelGroupPopup(null);
                    try {
                      await axios.delete("/api/cancel-message", {
                        data: { messageIds: ids, senderId: userId },
                      });
                      setSentMessages((prev) =>
                        prev.filter((m) => !ids.includes(m.id))
                      );

                      // サーバー側でカウントが適切に管理されるため、
                      // フロントエンド側での手動調整は不要
                    } catch {
                      alert("取り消しに失敗しました");
                    }
                  }}
                  className="
                  bg-red-500 text-white px-6 py-2 rounded-3xl hover:bg-red-600
                  transition-transform duration-200 ease-out active:scale-90
                "
                >
                  全て取り消す
                </button>
                <button
                  onClick={() => setCancelGroupPopup(null)}
                  className="
                  bg-gray-500 text-white px-6 py-2 rounded-3xl hover:bg-gray-600
                  transition-transform duration-200 ease-out active:scale-90
                "
                >
                  もどる
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ─── リンクアクションポップアップ ─── */}
      {linkPopup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              {linkPopup.linkImage ? (
                <Image
                  src={linkPopup.linkImage}
                  alt={linkPopup.linkTitle || linkPopup.message}
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
                  linkPopup.linkImage ? "hidden" : ""
                }`}
              >
                URL
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">
                  {linkPopup.linkTitle || linkPopup.message}
                </p>
                {linkPopup.linkTitle &&
                  (linkPopup.message.includes(" ") ||
                    linkPopup.message.includes("　")) && (
                    <p className="text-xs text-gray-500 truncate">
                      {linkPopup.message
                        .replace(
                          /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/,
                          ""
                        )
                        .trim()}
                    </p>
                  )}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleOpenLink}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition"
              >
                リンク先へ
              </button>
              <button
                onClick={() => setLinkPopup(null)}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 px-4 rounded-xl transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
