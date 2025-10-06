// app/components/UrlBlockSimple.tsx - 送信待機バー用の簡潔なURLボックス

"use client";
import React from "react";
import Image from "next/image";
import type { UrlMetadata } from "../lib/url-metadata";

interface UrlBlockSimpleProps {
  metadata: UrlMetadata;
  onRemove: () => void;
  onClick?: () => void;
}

export default function UrlBlockSimple({
  metadata,
  onRemove,
  onClick,
}: UrlBlockSimpleProps) {
  return (
    <div
      className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all duration-200 ${
        onClick ? "cursor-pointer" : ""
      } bg-white border-orange-200 hover:bg-orange-50`}
      onClick={onClick}
    >
      {/* サムネイル画像 */}
      <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
        {metadata.image ? (
          <Image
            src={metadata.image}
            alt={metadata.title}
            width={48}
            height={48}
            className="w-full h-full object-cover"
            onError={(e) => {
              // 画像読み込みエラー時のフォールバック
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-200 to-orange-300">
            <span className="text-orange-600 font-bold text-sm">
              {metadata.domain.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* タイトルのみ */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 text-sm leading-tight line-clamp-2">
          {metadata.title}
        </h3>
      </div>

      {/* 削除ボタン */}
      <button
        onClick={(e) => {
          e.stopPropagation(); // 親要素のクリックイベントを防ぐ
          onRemove();
        }}
        className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
        aria-label="URLを削除"
      >
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
