// app/components/NotificationSettings.tsx

"use client";

import { useState, useEffect } from "react";
import { subscribePush } from "@/app/lib/push";

type SubscriptionStatus =
  | "idle"
  | "checking"
  | "subscribed"
  | "error"
  | "no_permission"
  | "no_service_worker";

interface SubscriptionState {
  type: SubscriptionStatus;
  message: string;
}

export default function NotificationSettings() {
  const [status, setStatus] = useState<SubscriptionState>({
    type: "idle",
    message: "",
  });
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | null
  >(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // 通知許可状態を確認
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const checkSubscription = async () => {
    setIsChecking(true);
    setStatus({ type: "checking", message: "確認中..." });

    if (typeof window === "undefined") {
      setStatus({
        type: "error",
        message: "このブラウザでは通知がサポートされていません",
      });
      setIsChecking(false);
      return;
    }

    if (!("serviceWorker" in navigator)) {
      setStatus({
        type: "no_service_worker",
        message: "このブラウザではService Workerがサポートされていません",
      });
      setIsChecking(false);
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        setStatus({
          type: "subscribed",
          message: "通知は有効です",
        });
      } else {
        setStatus({
          type: "idle",
          message: "通知が無効です",
        });
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : String(e);
      setStatus({
        type: "error",
        message: `状態確認エラー: ${errorMessage}`,
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubscribe = async () => {
    setStatus({ type: "checking", message: "通知を有効化しています..." });

    try {
      const result = await subscribePush();

      if (result && result.success) {
        // 少し待ってから状態を確認
        setTimeout(() => {
          checkSubscription();
          // 通知許可状態も再確認
          if (typeof window !== "undefined" && "Notification" in window) {
            setNotificationPermission(Notification.permission);
          }
        }, 1000);
      } else {
        const reason = result?.reason || "unknown";
        let errorMessage = "通知の有効化に失敗しました";

        switch (reason) {
          case "permission_denied":
            errorMessage = "通知が拒否されています。設定アプリから通知を許可してください。";
            setStatus({ type: "no_permission", message: errorMessage });
            break;
          case "permission_not_granted":
            errorMessage = "通知の許可が必要です。";
            setStatus({ type: "no_permission", message: errorMessage });
            break;
          case "no_token":
            errorMessage = "ログインが必要です。";
            setStatus({ type: "error", message: errorMessage });
            break;
          case "no_service_worker":
            errorMessage = "Service Workerがサポートされていません。";
            setStatus({ type: "no_service_worker", message: errorMessage });
            break;
          case "no_push_manager":
            errorMessage = "プッシュ通知がサポートされていません。";
            setStatus({ type: "error", message: errorMessage });
            break;
          default:
            setStatus({
              type: "error",
              message: `${errorMessage}: ${result?.error || reason}`,
            });
        }

        // 通知許可状態も更新
        if (typeof window !== "undefined" && "Notification" in window) {
          setNotificationPermission(Notification.permission);
        }
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : String(e);
      setStatus({
        type: "error",
        message: `通知の有効化に失敗しました: ${errorMessage}`,
      });
    }
  };

  useEffect(() => {
    // 初期状態を確認
    checkSubscription();
  }, []);

  // iOS判定
  const isIOS =
    typeof window !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  
  // PWA判定
  const isPWA =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      ((window.navigator as Navigator & { standalone?: boolean })
        .standalone === true));

  return (
    <div className="p-4 space-y-4 bg-white rounded-lg border border-gray-200">
      <h2 className="text-lg font-bold text-gray-800">通知設定</h2>

      {/* iOS PWA の場合の特別なメッセージ */}
      {isIOS && !isPWA && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
          <p className="font-semibold text-yellow-800">
            ⚠️ PWAとしてインストールしてください
          </p>
          <p className="text-yellow-700 mt-1">
            Safariのメニューから「ホーム画面に追加」を選択して、アプリをインストールしてください。
            インストール後、再度こちらから通知を有効化してください。
          </p>
        </div>
      )}

      {/* 通知許可状態 */}
      <div>
        <p className="text-sm text-gray-600 mb-1">通知許可状態:</p>
        <p className="font-semibold text-gray-800">
          {notificationPermission === "granted" && "✅ 許可済み"}
          {notificationPermission === "denied" && "❌ 拒否済み"}
          {(notificationPermission === "default" ||
            notificationPermission === null) && "⚠️ 未設定"}
        </p>
        {notificationPermission === "denied" && (
          <p className="text-xs text-red-600 mt-1">
            通知が拒否されています。設定アプリから通知を許可してください。
            {isIOS && (
              <span className="block mt-1">
                iOSの場合: 設定 → Safari → 通知 から許可してください。
              </span>
            )}
          </p>
        )}
      </div>

      {/* 購読状態 */}
      <div>
        <p className="text-sm text-gray-600 mb-1">プッシュ通知状態:</p>
        <p className="font-semibold text-gray-800">
          {status.type === "subscribed" && "✅ 有効"}
          {status.type === "idle" && "❌ 無効"}
          {status.type === "checking" && "🔄 確認中..."}
          {(status.type === "error" ||
            status.type === "no_permission" ||
            status.type === "no_service_worker") &&
            `⚠️ ${status.message}`}
        </p>
        {status.message && status.type !== "checking" && (
          <p className="text-xs text-gray-600 mt-1">{status.message}</p>
        )}
      </div>

      {/* アクションボタン */}
      <div className="space-y-2">
        {status.type !== "subscribed" &&
          notificationPermission !== "denied" &&
          status.type !== "no_service_worker" && (
            <button
              onClick={handleSubscribe}
              disabled={status.type === "checking" || isChecking}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status.type === "checking" || isChecking
                ? "処理中..."
                : "通知を有効にする"}
            </button>
          )}

        {/* 再確認ボタン */}
        <button
          onClick={checkSubscription}
          disabled={isChecking}
          className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          状態を再確認
        </button>
      </div>

      {/* ヘルプテキスト */}
      <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-200">
        <p>• 通知を有効にするには、ブラウザの通知許可が必要です</p>
        <p>• iPhone/iPadの場合、PWAとしてインストールする必要があります</p>
        <p>
          • 通知が届かない場合は、ブラウザの設定で通知がブロックされていないか確認してください
        </p>
      </div>
    </div>
  );
}

