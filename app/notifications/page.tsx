// app/notifications/page.tsx
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Image from "next/image";
import { useChatData } from "@/app/contexts/ChatDataContext";

// ──────────── 型定義 ────────────
interface SentMessage {
  id: string;
  receiver: { id: string; name: string };
  message: string;
  linkTitle?: string;
  linkImage?: string;
  createdAt: string;
  isMatched: boolean;
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
  const { setPresetMessages } = useChatData();

  // ──────────── ステート管理 ────────────
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [cancelPopup, setCancelPopup] = useState<SentMessage | null>(null);
  const [animateExit, setAnimateExit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null
  );

  // セクション分割（未マッチ／マッチ済み）
  const { unmatchedMessages, matchedMessages } = useMemo(() => {
    const unmatched = sentMessages.filter((m) => !m.isMatched);
    const matched = sentMessages.filter((m) => m.isMatched);
    return { unmatchedMessages: unmatched, matchedMessages: matched };
  }, [sentMessages]);

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
                    <h3 className="text-sm font-bold text-gray-700 mb-2">
                      まだマッチしてないことば
                    </h3>
                    <ul className="space-y-3">
                      {unmatchedMessages.map((msg) => (
                        <li
                          key={msg.id}
                          className="
                            list-none flex items-center justify-between p-3
                            bg-white shadow rounded-3xl
                            transition-all duration-300 ease-out active:scale-90
                          "
                        >
                          {/* アイコン＋送信相手＋テキスト */}
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                              style={{
                                backgroundColor: getBgColor(msg.receiver.name),
                              }}
                            >
                              {msg.receiver.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">
                                To {msg.receiver.name}
                              </p>
                              {msg.linkTitle || msg.linkImage ? (
                                // リンクメタデータがある場合のプレビュー表示
                                <div className="flex items-start gap-2 mt-1">
                                  {msg.linkImage ? (
                                    <Image
                                      src={msg.linkImage}
                                      alt={msg.linkTitle || msg.message}
                                      width={32}
                                      height={32}
                                      className="w-8 h-8 object-cover rounded-lg border border-orange-200 flex-shrink-0"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                        e.currentTarget.nextElementSibling?.classList.remove(
                                          "hidden"
                                        );
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className={`w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0 ${
                                      msg.linkImage ? "hidden" : ""
                                    }`}
                                  >
                                    URL
                                  </div>
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    {msg.linkTitle &&
                                    (msg.message.includes(" ") ||
                                      msg.message.includes("　") ||
                                      msg.message.match(
                                        /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%].+)$/
                                      )) ? (
                                      // リンク+テキストの場合
                                      <>
                                        <p className="text-sm font-bold text-gray-800">
                                          {msg.linkTitle}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate mt-1">
                                          {msg.message
                                            .replace(
                                              /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/,
                                              ""
                                            )
                                            .trim()}
                                        </p>
                                      </>
                                    ) : (
                                      // 通常のリンクの場合
                                      <>
                                        <p className="text-sm font-bold text-gray-800">
                                          {msg.linkTitle || msg.message}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                // 通常のテキストメッセージの場合
                                <p className="text-medium whitespace-normal break-words">
                                  {msg.message}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* 日付＋moreボタン（未マッチのみ） */}
                          <div className="flex items-center gap-2 flex-none shrink-0">
                            {formatDate(msg.createdAt) && (
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {formatDate(msg.createdAt)}
                              </span>
                            )}
                            <button
                              onClick={() => setCancelPopup(msg)}
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
                  </section>
                )}

                {/* ─── マッチ済みセクション ─── */}
                {matchedMessages.length > 0 && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-700 mb-2">
                      マッチしたことば
                    </h3>
                    <ul className="space-y-3">
                      {matchedMessages.map((msg) => (
                        <li
                          key={msg.id}
                          className="
                            list-none flex items-center justify-between p-3
                            bg-white shadow rounded-3xl
                          "
                        >
                          {/* アイコン＋送信相手＋テキスト */}
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                              style={{
                                backgroundColor: getBgColor(msg.receiver.name),
                              }}
                            >
                              {msg.receiver.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">
                                To {msg.receiver.name}
                              </p>
                              {msg.linkTitle || msg.linkImage ? (
                                // リンクメタデータがある場合のプレビュー表示
                                <div className="flex items-start gap-2 mt-1">
                                  {msg.linkImage ? (
                                    <Image
                                      src={msg.linkImage}
                                      alt={msg.linkTitle || msg.message}
                                      width={32}
                                      height={32}
                                      className="w-8 h-8 object-cover rounded-lg border border-orange-200 flex-shrink-0"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                        e.currentTarget.nextElementSibling?.classList.remove(
                                          "hidden"
                                        );
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className={`w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0 ${
                                      msg.linkImage ? "hidden" : ""
                                    }`}
                                  >
                                    URL
                                  </div>
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    {msg.linkTitle &&
                                    (msg.message.includes(" ") ||
                                      msg.message.includes("　") ||
                                      msg.message.match(
                                        /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%].+)$/
                                      )) ? (
                                      // リンク+テキストの場合
                                      <>
                                        <p className="text-sm font-bold text-gray-800">
                                          {msg.linkTitle}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate mt-1">
                                          {msg.message
                                            .replace(
                                              /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/,
                                              ""
                                            )
                                            .trim()}
                                        </p>
                                      </>
                                    ) : (
                                      // 通常のリンクの場合
                                      <>
                                        <p className="text-sm font-bold text-gray-800">
                                          {msg.linkTitle || msg.message}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                // 通常のテキストメッセージの場合
                                <p className="text-medium whitespace-normal break-words">
                                  {msg.message}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* 日付＋“マッチ済”バッジ（More なし） */}
                          <div className="flex items-center gap-2 flex-none shrink-0">
                            {formatDate(msg.createdAt) && (
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {formatDate(msg.createdAt)}
                              </span>
                            )}
                            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-600 font-semibold">
                              マッチ済
                            </span>
                          </div>
                        </li>
                      ))}
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

                    // メインページの presetMessages のカウントを更新
                    setPresetMessages((prev) => {
                      const updated = prev.map((p) =>
                        p.content === cancelPopup.message
                          ? { ...p, count: Math.max(0, p.count - 1) }
                          : p
                      );
                      return updated.filter((p) => p.count > 0);
                    });
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
    </div>
  );
}
