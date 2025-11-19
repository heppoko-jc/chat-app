// app/components/EnglishModePopup.tsx
"use client";

import { useState, useEffect } from "react";

export default function EnglishModePopup() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // localStorageをチェックして、まだ表示していない場合のみ表示
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("englishModePopupDismissed");
      if (!dismissed) {
        // 少し遅延を入れて、メイン画面の読み込み後に表示
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleDontShowAgain = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("englishModePopupDismissed", "true");
    }
    setIsVisible(false);
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-11/12 max-w-sm mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">
          Want English mode?
        </h2>
        <p className="text-base text-gray-600 mb-6 text-center">
          Tap Happy Ice Cream!
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleDontShowAgain}
            className="w-full bg-gray-200 text-gray-700 py-3 rounded-2xl font-semibold transition-transform duration-200 ease-out active:scale-95"
          >
            Don't show this again
          </button>
          <button
            onClick={handleClose}
            className="w-full bg-gradient-to-r from-orange-400 to-orange-500 text-white py-3 rounded-2xl font-semibold transition-transform duration-200 ease-out active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

