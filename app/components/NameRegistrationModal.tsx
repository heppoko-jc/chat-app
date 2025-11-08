// app/components/NameRegistrationModal.tsx
"use client";

import { useState, useEffect } from "react";
import axios from "axios";

interface NameRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  currentName: string; // 既存の表示名
}

export default function NameRegistrationModal({
  isOpen,
  onClose,
  onSave,
  currentName,
}: NameRegistrationModalProps) {
  const [nameEn, setNameEn] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [nameOther, setNameOther] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showEmptyWarning, setShowEmptyWarning] = useState(false);

  // モーダルが開かれたときに既存の値を読み込む
  useEffect(() => {
    if (isOpen) {
      const loadExistingNames = async () => {
        try {
          const token = localStorage.getItem("token");
          if (!token) return;

          const res = await axios.get("/api/auth/profile", {
            headers: { Authorization: `Bearer ${token}` },
          });

          setNameEn(res.data.nameEn || "");
          setNameJa(res.data.nameJa || "");
          setNameOther(res.data.nameOther || "");
        } catch (error) {
          console.error("既存の名前取得エラー:", error);
        }
      };

      loadExistingNames();
    }
  }, [isOpen]);

  const handleSave = async () => {
    // すべて空欄の場合の警告
    if (!nameEn.trim() && !nameJa.trim() && !nameOther.trim()) {
      setShowEmptyWarning(true);
      return;
    }

    setIsSaving(true);
    setShowEmptyWarning(false);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("ログインしてください");
        return;
      }

      await axios.put(
        "/api/auth/profile",
        {
          nameEn: nameEn.trim() || null,
          nameJa: nameJa.trim() || null,
          nameOther: nameOther.trim() || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      onSave();
      onClose();
    } catch (error) {
      console.error("名前の保存エラー:", error);
      // トースト表示（簡易版）
      alert("名前の保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmEmptySave = async () => {
    setShowEmptyWarning(false);
    setIsSaving(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("ログインしてください");
        return;
      }

      await axios.put(
        "/api/auth/profile",
        {
          nameEn: null,
          nameJa: null,
          nameOther: null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      onSave();
      onClose();
    } catch (error) {
      console.error("名前の保存エラー:", error);
      alert("名前の保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
          <h3 className="text-2xl font-bold text-orange-500 mb-2 text-center">
            名前を登録してください
          </h3>
          <p className="text-sm text-gray-600 mb-4 text-center">
            フォロー画面でユーザー検索ができるようになりました。検索しやすいように名前を複数登録してください！
          </p>

          {/* 既存の表示名を表示 */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-600 mb-1">現在の表示名</p>
            <p className="text-base font-semibold text-gray-800">
              {currentName}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              この名前は検索対象に含まれます。以下に追加の名前を登録してください。
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block mb-1 font-semibold text-gray-700">
                English Name（任意）
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="例: Taro Yamada"
                className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="block mb-1 font-semibold text-gray-700">
                Japanese Name（任意）
              </label>
              <input
                type="text"
                value={nameJa}
                onChange={(e) => setNameJa(e.target.value)}
                placeholder="例: やまだたろう"
                className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="block mb-1 font-semibold text-gray-700">
                Other（任意）
              </label>
              <input
                type="text"
                value={nameOther}
                onChange={(e) => setNameOther(e.target.value)}
                placeholder="例: ニックネーム、別名など"
                className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              後で
            </button>
          </div>
        </div>
      </div>

      {/* 空欄保存の警告モーダル */}
      {showEmptyWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-3 text-center">
              確認
            </h3>
            <p className="text-sm text-gray-600 mb-4 text-center">
              検索用の別名が追加されていません。このまま登録して良いですか？
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmEmptySave}
                className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 transition"
              >
                登録する
              </button>
              <button
                onClick={() => setShowEmptyWarning(false)}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-300 transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
