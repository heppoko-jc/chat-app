// app/components/TestVerificationPopup.tsx
"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";

export default function TestVerificationPopup() {
  const { t, language } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // localStorageをチェックして、まだ表示していない場合のみ表示
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("testVerificationPopupDismissed");
      if (!dismissed) {
        // 少し遅延を入れて、メイン画面の読み込み後に表示
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleReadLater = () => {
    // 後でもう一度読む：閉じるだけで、次回も表示される
    setIsVisible(false);
  };

  const handleAgree = () => {
    // 同意する：localStorageに保存して閉じる（次回は表示されない）
    if (typeof window !== "undefined") {
      localStorage.setItem("testVerificationPopupDismissed", "true");
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-11/12 max-w-sm mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">
          {t("testVerification.title")}
        </h2>
        <p className="text-base text-gray-600 mb-6 text-center whitespace-pre-line">
          {t("testVerification.description")}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={handleReadLater}
            className="w-full bg-gray-200 text-gray-700 py-3 rounded-2xl font-semibold transition-transform duration-200 ease-out active:scale-95"
          >
            {t("testVerification.readLater")}
          </button>
          <button
            onClick={handleAgree}
            className="w-full bg-gradient-to-r from-orange-400 to-orange-500 text-white py-3 rounded-2xl font-semibold transition-transform duration-200 ease-out active:scale-95"
          >
            {t("testVerification.agree")}
          </button>
        </div>
      </div>
    </div>
  );
}

