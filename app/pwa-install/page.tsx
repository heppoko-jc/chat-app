// app/pwa-install/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PWAInstall() {
  const [isIOS, setIsIOS] = useState(false);
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // デバイス判定
    const userAgent = navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(iOS);

    // PWAモード判定
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean })?.standalone ===
        true;
    setIsInStandaloneMode(isStandalone);

    // 既にPWAモードで開いている場合は自動的にログインページへ
    if (isStandalone) {
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    }
  }, [router]);

  const handleContinue = () => {
    router.push("/login");
  };

  if (isInStandaloneMode) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-600 mb-2">
            インストール完了！
          </h1>
          <p className="text-gray-600 mb-4">
            PWAモードで正常に動作しています。
            <br />
            ログインページに移動します...
          </p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-blue-600 text-white p-6">
          <h1 className="text-xl font-bold text-center">
            アプリをホーム画面に追加してください
          </h1>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {isIOS ? (
            // iPhone手順
            <div className="space-y-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="text-center mb-3">
                  <div className="text-3xl">📱</div>
                  <h3 className="font-bold text-blue-900 text-lg mt-2">
                    iPhone
                  </h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">
                      1
                    </span>
                    <span>Safari：画面下の共有ボタン</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">
                      2
                    </span>
                    <span>「ホーム画面に追加」をタップ</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Android手順
            <div className="space-y-4 mb-6">
              <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <div className="text-center mb-3">
                  <div className="text-3xl">🤖</div>
                  <h3 className="font-bold text-green-900 text-lg mt-2">
                    Android
                  </h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">
                      1
                    </span>
                    <span>Chrome・Google：「ホーム画面に追加」</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">
                      2
                    </span>
                    <span>「インストール」をタップ</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ボタン */}
          <div>
            <button
              onClick={handleContinue}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700"
            >
              次へ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
