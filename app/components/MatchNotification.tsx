// app/components/MatchNotification.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  extractUrlAndText,
  fetchLinkMetadata,
  isLinkMessage,
} from "../lib/link-utils";

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
  const [isAnimating, setIsAnimating] = useState(false);
  const [linkPreview, setLinkPreview] = useState<{
    url: string;
    title: string;
    image?: string;
  } | null>(null);
  const [isLoadingLink, setIsLoadingLink] = useState(false);

  // 表示切替で入退場アニメーションだけ行う（自動クローズは無し）
  useEffect(() => {
    setIsAnimating(isVisible);
  }, [isVisible]);

  // リンクメタデータを取得
  useEffect(() => {
    if (!message || !isVisible) {
      setLinkPreview(null);
      setIsLoadingLink(false);
      return;
    }

    if (isLinkMessage(message)) {
      setIsLoadingLink(true);
      const urlAndText = extractUrlAndText(message);
      if (urlAndText) {
        fetchLinkMetadata(urlAndText.url)
          .then((metadata) => {
            if (metadata) {
              setLinkPreview(metadata);
            }
          })
          .catch((error) => {
            console.error("Error fetching link metadata:", error);
            setLinkPreview(null);
          })
          .finally(() => {
            setIsLoadingLink(false);
          });
      } else {
        setIsLoadingLink(false);
      }
    } else {
      setLinkPreview(null);
      setIsLoadingLink(false);
    }
  }, [message, isVisible]);

  const handleClose = (e?: React.MouseEvent) => {
    // イベント伝播を止める
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // アニメーション待ちをやめて即時に親へ閉じる指示（灰色オーバーレイ残留を防ぐ）
    onClose();
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
            {linkPreview ? (
              // リンクプレビュー表示
              <div className="flex items-center gap-3">
                {linkPreview.image ? (
                  <Image
                    src={linkPreview.image}
                    alt={linkPreview.title}
                    width={64}
                    height={64}
                    className="w-16 h-16 object-cover rounded-lg border border-orange-200 flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove(
                        "hidden"
                      );
                    }}
                  />
                ) : null}
                <div
                  className={`w-12 h-12 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0 ${
                    linkPreview.image ? "hidden" : ""
                  }`}
                >
                  URL
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">
                    {linkPreview.title}
                  </p>
                  {(() => {
                    const urlAndText = extractUrlAndText(message || "");
                    return urlAndText && urlAndText.text ? (
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {urlAndText.text}
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>
            ) : isLoadingLink ? (
              // ローディング表示
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin"></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500">リンク情報を取得中...</p>
                </div>
              </div>
            ) : (
              // 通常のメッセージ表示
              <p className="font-semibold text-gray-800 text-center">
                「{message}」
              </p>
            )}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex justify-center">
          <button
            onClick={(e) => handleClose(e)}
            className="w-full bg-gradient-to-r from-orange-400 to-orange-500 text-white py-3 rounded-2xl font-semibold transition-transform duration-200 ease-out active:scale-95"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
