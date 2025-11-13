// app/components/ShortcutCreateModal.tsx - ショートカット作成モーダル

"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import axios from "axios";

interface User {
  id: string;
  name: string;
  bio: string | null;
}

interface ShortcutCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  friends: User[];
}

export default function ShortcutCreateModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  friends,
}: ShortcutCreateModalProps) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [shortcutName, setShortcutName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // モーダルが開かれたときにリセット
  useEffect(() => {
    if (isOpen) {
      setSelectedMemberIds([]);
      setShortcutName("");
    }
  }, [isOpen]);

  // モーダルを閉じる
  const handleClose = () => {
    if (!isCreating) {
      setSelectedMemberIds([]);
      setShortcutName("");
      onClose();
    }
  };

  // メンバーを選択/解除
  const toggleMember = (memberId: string) => {
    if (isCreating) return;
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  // ショートカット名を自動生成（選択したユーザーの名前の羅列）
  const generateAutoName = (selectedIds: string[]): string => {
    if (selectedIds.length === 0) return "";
    const selectedUsers = friends.filter((f) => selectedIds.includes(f.id));
    if (selectedUsers.length === 0) return "";
    if (selectedUsers.length === 1) {
      return selectedUsers[0].name;
    }
    const firstName = selectedUsers[0].name;
    const restCount = selectedUsers.length - 1;
    return `${firstName}ほか${restCount}人`;
  };

  // ショートカットを作成
  const handleCreate = async () => {
    if (selectedMemberIds.length === 0 || isCreating) return;

    setIsCreating(true);
    try {
      const name = shortcutName.trim() || generateAutoName(selectedMemberIds);

      await axios.post(
        "/api/shortcuts",
        {
          name: name || null,
          memberIds: selectedMemberIds,
        },
        {
          headers: { userId },
        }
      );

      onSuccess();
      handleClose();
    } catch (error) {
      console.error("ショートカット作成エラー:", error);
      alert("ショートカットの作成に失敗しました");
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  // 背景色を生成する関数
  const getBgColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++)
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const h = hash % 360;
    return `hsl(${h}, 70%, 80%)`;
  };

  // イニシャルを取得する関数
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-t-3xl w-full max-w-md max-h-[90vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "slideUp 0.3s ease-out",
        }}
      >
        {/* ヘッダー */}
        <div className="relative flex items-center justify-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 text-center">
            ショートカットを作成
          </h2>
          <button
            onClick={handleClose}
            className="absolute right-4 text-gray-500 hover:text-gray-700 transition-colors text-2xl font-bold"
            disabled={isCreating}
          >
            ×
          </button>
        </div>

        {/* 説明文 */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-sm text-gray-600 text-center">
            ショートカットは自分だけのもので、作成しても友だちには通知されません。
          </p>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* ショートカット名入力 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ショートカット名（任意）
            </label>
            <input
              type="text"
              value={shortcutName}
              onChange={(e) => setShortcutName(e.target.value)}
              placeholder={
                selectedMemberIds.length > 0
                  ? generateAutoName(selectedMemberIds)
                  : "名前を入力（未入力の場合は自動生成）"
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              disabled={isCreating}
            />
          </div>

          {/* メンバー選択 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              メンバーを選択（{selectedMemberIds.length}人選択中）
            </label>
            <div className="max-h-[50vh] overflow-y-auto">
              {friends.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  フォローしているユーザーがいません
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {friends.map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => toggleMember(friend.id)}
                      disabled={isCreating}
                      className={`flex items-center justify-center px-3 py-2 rounded-lg border-2 transition-all relative ${
                        selectedMemberIds.includes(friend.id)
                          ? "bg-gray-100 border-black shadow-md"
                          : "bg-white border-gray-200 hover:border-gray-400 hover:shadow-sm"
                      } ${isCreating ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <span
                        className={`text-sm font-medium truncate ${
                          selectedMemberIds.includes(friend.id)
                            ? "text-black font-bold"
                            : "text-gray-700"
                        }`}
                      >
                        {friend.name}
                      </span>
                      {selectedMemberIds.includes(friend.id) && (
                        <div className="absolute top-0 right-0 w-4 h-4 bg-black rounded-full flex items-center justify-center -mt-1 -mr-1">
                          <span className="text-white text-xs font-bold">
                            ✓
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleCreate}
            disabled={selectedMemberIds.length === 0 || isCreating}
            className={`w-full py-3 px-4 rounded-xl font-bold transition-colors ${
              selectedMemberIds.length === 0 || isCreating
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-black text-white hover:bg-gray-800"
            }`}
          >
            {isCreating ? "作成中..." : "作成"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
