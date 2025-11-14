// app/components/ErrorNotification.tsx
"use client";

import { useEffect, useState } from "react";

interface ErrorNotificationProps {
  isVisible: boolean;
  message: string;
  onClose: () => void;
}

export default function ErrorNotification({
  isVisible,
  message,
  onClose,
}: ErrorNotificationProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  // 表示切替で入退場アニメーション
  useEffect(() => {
    setIsAnimating(isVisible);
  }, [isVisible]);

  // 3秒後に自動で閉じる
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 z-50"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className={`
          bg-white p-6 rounded-3xl shadow-2xl w-11/12 max-w-sm mx-4
          transform transition-all duration-300 ease-out
          ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="text-center mb-4">
          <div className="w-16 h-16 bg-gradient-to-r from-red-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            送信できませんでした
          </h2>
        </div>

        {/* メッセージ */}
        <div className="bg-red-50 rounded-2xl p-4 mb-4">
          <p className="text-sm text-gray-700 text-center">{message}</p>
        </div>

        {/* 閉じるボタン */}
        <button
          onClick={handleClose}
          className="w-full bg-gradient-to-r from-red-400 to-red-500 text-white py-3 rounded-2xl font-semibold transition-transform duration-200 ease-out active:scale-95"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
