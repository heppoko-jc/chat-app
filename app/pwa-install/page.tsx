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
          <h1 className="text-2xl font-bold text-center">
            アプリのインストール
          </h1>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          {/* 重要性の説明 */}
          <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
            <h2 className="font-semibold text-yellow-800 mb-2">
              📱 より良い体験のために
            </h2>
            <p className="text-sm text-yellow-700">
              アプリをホーム画面に追加することで、ネイティブアプリのような快適な操作が可能になります。
            </p>
          </div>

          {/* インストール手順 */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 text-center">
              {isIOS ? "📱 Safari での手順" : "📱 ブラウザでの手順"}
            </h2>

            {isIOS ? (
              // iOS Safari用手順
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Safariで開く</p>
                    <p className="text-sm text-gray-600">
                      このページをSafariで開いてください
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium">共有ボタンをタップ</p>
                    <p className="text-sm text-gray-600">
                      画面下部の{" "}
                      <span className="inline-block px-2 py-1 bg-blue-100 rounded text-xs">
                        □↑
                      </span>{" "}
                      ボタンをタップ
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium">「ホーム画面に追加」を選択</p>
                    <p className="text-sm text-gray-600">
                      メニューから「ホーム画面に追加」をタップ
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    4
                  </div>
                  <div>
                    <p className="font-medium">ホーム画面から開き直す</p>
                    <p className="text-sm text-gray-600">
                      追加されたアプリアイコンからアクセス
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              // Android Chrome等用手順
              <div className="space-y-4">
                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Chromeで開く</p>
                    <p className="text-sm text-gray-600">
                      このページをChromeで開いてください
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium">メニューを開く</p>
                    <p className="text-sm text-gray-600">右上の「⋮」をタップ</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium">「ホーム画面に追加」</p>
                    <p className="text-sm text-gray-600">
                      メニューから選択してインストール
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 注意事項 */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-2">💡 重要</h3>
            <p className="text-sm text-blue-700">
              インストール後は、必ずホーム画面のアプリアイコンから開き直してください。
              ブラウザからの直接アクセスでは一部機能が制限される場合があります。
            </p>
          </div>

          {/* ボタン */}
          <div className="space-y-3">
            <button
              onClick={handleContinue}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              インストール完了 / スキップ
            </button>

            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              ページを再読み込み
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            インストールせずに続行することも可能ですが、
            <br />
            最適な体験のためにインストールを推奨します
          </p>
        </div>
      </div>
    </div>
  );
}
