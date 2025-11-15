// app/components/ShortcutEditModal.tsx - ショートカット編集モーダル

"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";

interface User {
  id: string;
  name: string;
  bio: string | null;
}

interface ShortcutMember {
  id: string;
  memberId: string;
  memberName: string;
  memberBio: string | null;
  order: number;
}

interface Shortcut {
  id: string;
  userId: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  members: ShortcutMember[];
  memberCount: number;
}

interface ShortcutEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onDelete: () => void;
  userId: string;
  shortcut: Shortcut | null;
  friends: User[];
}

export default function ShortcutEditModal({
  isOpen,
  onClose,
  onSuccess,
  onDelete,
  userId,
  shortcut,
  friends,
}: ShortcutEditModalProps) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [shortcutName, setShortcutName] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // モーダルが開かれたときにショートカット情報を読み込む
  useEffect(() => {
    if (isOpen && shortcut) {
      setShortcutName(shortcut.name || "");
      setSelectedMemberIds(shortcut.members.map((m) => m.memberId));
    }
  }, [isOpen, shortcut]);

  // モーダルを閉じる
  const handleClose = () => {
    if (!isUpdating && !isDeleting) {
      setSelectedMemberIds([]);
      setShortcutName("");
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  // メンバーを選択/解除
  const toggleMember = (memberId: string) => {
    if (isUpdating || isDeleting) return;
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  // 全員選択/全選択解除
  const toggleSelectAll = () => {
    if (isUpdating || isDeleting) return;
    const allSelected =
      friends.length > 0 && selectedMemberIds.length === friends.length;
    if (allSelected) {
      // 全選択解除
      setSelectedMemberIds([]);
    } else {
      // 全員を選択
      setSelectedMemberIds(friends.map((f) => f.id));
    }
  };

  // ショートカット名を自動生成
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

  // ショートカットを更新
  const handleUpdate = async () => {
    if (!shortcut || selectedMemberIds.length === 0 || isUpdating) return;

    setIsUpdating(true);
    try {
      const name = shortcutName.trim() || generateAutoName(selectedMemberIds);

      await axios.patch(
        `/api/shortcuts/${shortcut.id}`,
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
      console.error("ショートカット更新エラー:", error);
      alert("ショートカットの更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  // ショートカットを削除
  const handleDelete = async () => {
    if (!shortcut || isDeleting) return;

    setIsDeleting(true);
    try {
      await axios.delete(`/api/shortcuts/${shortcut.id}`, {
        headers: { userId },
      });

      onDelete();
      handleClose();
    } catch (error) {
      console.error("ショートカット削除エラー:", error);
      alert("ショートカットの削除に失敗しました");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen || !shortcut) return null;

  return (
    <>
      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full select-none">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              ショートカットを削除しますか？
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              「{shortcut.name || generateAutoName(selectedMemberIds)}
              」を削除します。 この操作は取り消せません。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 focus:outline-none focus:ring-0"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-3 px-4 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors disabled:opacity-50 focus:outline-none focus:ring-0"
              >
                {isDeleting ? "削除中..." : "削除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end justify-center"
        onClick={handleClose}
      >
        <div
          className="bg-white rounded-t-3xl w-full max-w-md max-h-[90vh] flex flex-col animate-slide-up select-none"
          onClick={(e) => e.stopPropagation()}
          style={{
            animation: "slideUp 0.3s ease-out",
          }}
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">
              ショートカットを編集
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700 transition-colors text-2xl font-bold focus:outline-none focus:ring-0"
              disabled={isUpdating || isDeleting}
            >
              ×
            </button>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 select-text"
                disabled={isUpdating || isDeleting}
              />
            </div>

            {/* メンバー選択 */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  メンバーを選択（{selectedMemberIds.length}人選択中）
                </label>
                {friends.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    disabled={isUpdating || isDeleting}
                    className={`text-sm font-medium px-3 py-1 rounded-lg border transition-colors focus:outline-none focus:ring-0 select-none ${
                      friends.length > 0 &&
                      selectedMemberIds.length === friends.length
                        ? "bg-black text-white border-black"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    } ${
                      isUpdating || isDeleting
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {friends.length > 0 &&
                    selectedMemberIds.length === friends.length
                      ? "全選択解除"
                      : "全員を選択"}
                  </button>
                )}
              </div>
              <div className="max-h-[50vh] overflow-y-auto overflow-x-hidden">
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
                        disabled={isUpdating || isDeleting}
                        className={`flex items-center justify-center px-3 py-2 rounded-lg border-2 relative focus:outline-none focus:ring-0 select-none ${
                          selectedMemberIds.includes(friend.id)
                            ? "bg-gray-100 border-black shadow-md"
                            : "bg-white border-gray-200 hover:border-gray-400 hover:shadow-sm"
                        } ${
                          isUpdating || isDeleting
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
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
          <div className="p-4 border-t border-gray-200 space-y-2">
            <button
              onClick={handleUpdate}
              disabled={
                selectedMemberIds.length === 0 || isUpdating || isDeleting
              }
              className={`w-full py-3 px-4 rounded-xl font-bold transition-colors focus:outline-none focus:ring-0 ${
                selectedMemberIds.length === 0 || isUpdating || isDeleting
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-black text-white hover:bg-gray-800"
              }`}
            >
              {isUpdating ? "更新中..." : "更新"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isUpdating || isDeleting}
              className="w-full py-3 px-4 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 focus:outline-none focus:ring-0"
            >
              削除
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
    </>
  );
}
