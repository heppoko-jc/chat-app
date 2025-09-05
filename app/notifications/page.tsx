// app/notifications/page.tsx

"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Image from "next/image";
import { useChatData } from "@/app/contexts/ChatDataContext";

// ──────────── 型定義 ────────────
interface SentMessage {
  id: string;
  receiver: { id: string; name: string };
  message: string;
  createdAt: string;
  isMatched: boolean;
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

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  // ──────────── データ取得 ────────────
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);
  useEffect(() => {
    if (!userId) return;
    axios
      .get(`/api/notifications?userId=${userId}`)
      .then((res) => {
        // マッチ済み以外のみ表示
        setSentMessages(
          (res.data.sentMessages as SentMessage[]).filter((m) => !m.isMatched)
        );
        // res.data.matchedPairs は未使用なので参照しない
      })
      .catch(console.error);
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
          ことばをシェアした履歴です。<br />
          右のボタンから取り消すこともできます。
        </h2>
      </div>

      {/* ─── スクロール可能リスト ─── */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {sentMessages.length > 0 ? (
          sentMessages.map((msg) => (
            <li
              key={msg.id}
              className="
                list-none flex items-center justify-between p-3
                bg-white shadow rounded-3xl
                transition-all duration-300 ease-out active:scale-90
              "
            >
              {/* アイコン＋送信相手＋テキスト */}
              <div className="flex items-center gap-3 flex-1">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: getBgColor(msg.receiver.name) }}
                >
                  {msg.receiver.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">To {msg.receiver.name}</p>
                  <p className="text-medium whitespace-nowrap">{msg.message}</p>
                </div>
              </div>
              {/* 日付＋moreボタン */}
              <div className="flex gap-2">
                {formatDate(msg.createdAt) && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatDate(msg.createdAt)}
                  </span>
                )}
                <button
                  onClick={() => setCancelPopup(msg)}
                  className="p-2 transition-transform duration-200 ease-out active:scale-90"
                >
                  <Image src="/icons/more.png" alt="More" width={18} height={18} />
                </button>
              </div>
            </li>
          ))
        ) : (
          <p className="text-center text-gray-500">
            読み込み中...<br />
            または、まだことばをシェアしたことがありません。
          </p>
        )}
      </div>

      {/* ─── 取り消し確認ポップアップ ─── */}
      {cancelPopup && (
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
                  setCancelPopup(null);
                  const id = cancelPopup.id;
                  try {
                    await axios.delete("/api/cancel-message", {
                      data: { messageId: id, senderId: userId },
                    });
                    setSentMessages((prev) => prev.filter((m) => m.id !== id));

                    // メインページのpresetMessagesのカウントを更新
                    setPresetMessages((prev) => {
                      const updated = prev.map((msg) =>
                        msg.content === cancelPopup.message
                          ? { ...msg, count: Math.max(0, msg.count - 1) }
                          : msg
                      );
                      // カウントが0になったものは削除
                      return updated.filter((msg) => msg.count > 0);
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