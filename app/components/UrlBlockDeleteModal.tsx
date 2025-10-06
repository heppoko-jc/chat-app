// app/components/UrlBlockDeleteModal.tsx - URLボックス削除確認モーダル

"use client";
import React from "react";

interface UrlBlockDeleteModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  urlTitle: string;
}

export default function UrlBlockDeleteModal({
  isOpen,
  onConfirm,
  onCancel,
  urlTitle,
}: UrlBlockDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            URLボックスを削除しますか？
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            「{urlTitle}」のURLボックスが削除され、通常の入力モードに戻ります。
          </p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 px-4 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors"
            >
              削除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
