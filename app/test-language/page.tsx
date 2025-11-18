"use client";

import { useLanguage } from "../contexts/LanguageContext";

export default function TestLanguage() {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold mb-6">言語設定テスト</h1>
        
        <div className="space-y-4">
          <div>
            <p className="text-lg mb-2">現在の言語: <span className="font-bold">{language}</span></p>
          </div>

          <button
            onClick={toggleLanguage}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            言語を切り替え ({language === "ja" ? "日本語 → English" : "English → 日本語"})
          </button>

          <div className="mt-8 p-4 bg-gray-100 rounded-lg">
            <h2 className="font-bold mb-4">翻訳テスト:</h2>
            <ul className="space-y-2">
              <li>たった今: {t("time.justNow")}</li>
              <li>5分前: {t("time.minutesAgo", { n: 5 })}</li>
              <li>2時間前: {t("time.hoursAgo", { n: 2 })}</li>
              <li>3日前: {t("time.daysAgo", { n: 3 })}</li>
              <li>2週間前: {t("time.weeksAgo", { n: 2 })}</li>
              <li>1ヶ月前: {t("time.monthsAgo", { n: 1 })}</li>
              <li>1年前: {t("time.yearsAgo", { n: 1 })}</li>
            </ul>
          </div>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h2 className="font-bold mb-2">確認ポイント:</h2>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>言語切り替えボタンをクリックして、言語が切り替わるか確認</li>
              <li>翻訳テキストが正しく表示されるか確認</li>
              <li>ブラウザのコンソールにエラーが出ていないか確認</li>
              <li>ページをリロードして、設定が保持されるか確認</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

