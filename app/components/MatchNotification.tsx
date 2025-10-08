// app/components/MatchNotification.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";

interface MatchNotificationProps {
  isVisible: boolean;
  onClose: () => void;
  matchedUser?: {
    id: string;
    name: string;
  };
  message?: string;
}

export default function MatchNotification({
  isVisible,
  onClose,
  matchedUser,
  message,
}: MatchNotificationProps) {
  const router = useRouter();
  const [isAnimating, setIsAnimating] = useState(false);

  // 表示切替で入退場アニメーションだけ行う（自動クローズは無し）
  useEffect(() => {
    setIsAnimating(isVisible);
  }, [isVisible]);

  const handleClose = (e?: React.MouseEvent) => {
    // イベント伝播を止める
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // アニメーション待ちをやめて即時に親へ閉じる指示（灰色オーバーレイ残留を防ぐ）
    onClose();
  };

  const handleOpenChat = async (e?: React.MouseEvent) => {
    // イベント伝播を止める
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      const partnerId = matchedUser?.id;
      if (!partnerId) {
        handleClose();
        router.push("/chat-list");
        return;
      }
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : null;
      if (!userId) {
        handleClose();
        router.push("/chat-list");
        return;
      }
      // 画面導線に依らず、開く時点でチャットリストの強調/新着を解除できるように先に通知しておく
      try {
        // partnerId から ensure で得る chatId とは異なる可能性があるため、
        // ここではチャットIDが未確定。遷移後にチャット画面側でも確実に解除する実装と併用する。
        window.dispatchEvent(new CustomEvent("match-opened", { detail: {} }));
      } catch {}
      // チャット部屋を確実に用意して遷移
      const res = await axios.post<{ chatId: string }>(
        "/api/chat/ensure",
        { partnerId },
        { headers: { userId } }
      );
      // chatId が確定したので、念のためもう一度正しい chatId で解除通知
      try {
        window.dispatchEvent(
          new CustomEvent("match-opened", {
            detail: { chatId: res.data.chatId },
          })
        );
      } catch {}
      handleClose();
      router.push(`/chat/${res.data.chatId}`);
    } catch (e) {
      console.error("[MatchNotification] open chat failed:", e);
      handleClose();
      router.push("/chat-list");
    }
  };

  if (!isVisible) return null;

  return (
    // オーバーレイ自体のクリックで閉じる
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 z-50"
      onClick={(e) => {
        // オーバーレイ自体がクリックされた場合のみ閉じる
        if (e.target === e.currentTarget) {
          handleClose(e);
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`
          bg-white p-6 rounded-3xl shadow-2xl w-11/12 max-w-sm mx-4
          transform transition-all duration-300 ease-out
          ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"}
        `}
      >
        {/* ヘッダー */}
        <div className="text-center mb-4">
          <div className="w-16 h-16 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-3">
            <Image
              src="/icons/check2.png"
              alt="Match"
              width={32}
              height={32}
              className="text-white"
            />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            マッチング成立！
          </h2>
          <p className="text-sm text-gray-600">同じことばをシェアしました</p>
        </div>

        {/* マッチ情報 */}
        <div className="bg-orange-50 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
              style={{
                backgroundColor: `hsl(${
                  ((matchedUser?.name?.charCodeAt(0) ?? 71) * 137.5) % 360
                }, 70%, 60%)`,
              }}
            >
              {matchedUser?.name?.charAt(0) ?? "G"}
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                {matchedUser?.name ?? "Guest"} さん
              </p>
              <p className="text-sm text-gray-600">とマッチしました</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3">
            <p className="text-sm text-gray-600 mb-1">シェアしたことば</p>
            <p className="font-semibold text-gray-800 text-center">
              「{message}」
            </p>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex gap-3">
          <button
            onClick={(e) => handleOpenChat(e)}
            className="flex-1 bg-gradient-to-r from-orange-400 to-orange-500 text-white py-3 rounded-2xl font-semibold transition-transform duration-200 ease-out active:scale-95"
          >
            チャットを開く
          </button>
          <button
            onClick={(e) => handleClose(e)}
            className="px-4 py-3 text-gray-500 font-semibold transition-transform duration-200 ease-out active:scale-95"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
