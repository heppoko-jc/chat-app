"use client";

import { useEffect, useRef } from "react";

export default function AppOpenLogger() {
  const sentOnceRef = useRef(false);

  useEffect(() => {
    const trySend = async () => {
      if (sentOnceRef.current) return;
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return;

      sentOnceRef.current = true;
      try {
        await fetch("/api/telemetry/open", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ at: Date.now() }),
          keepalive: true,
        });
      } catch {
        // swallow (minimal implementation). Optionally queue for retry.
      }
    };

    // first attempt immediately
    void trySend();

    const onVis = () => void trySend();
    const onShow = () => void trySend();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  // 通知からの通知データを受信してlocalStorageに保存
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined")
      return;

    // Service Workerがサポートされているか確認
    if (!("serviceWorker" in navigator)) {
      console.log("Service Worker is not supported");
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PENDING_NOTIFICATION") {
        const notificationData = event.data.data;
        console.log("通知データを受信:", notificationData);

        // localStorageに保存（表示用）
        try {
          localStorage.setItem(
            "pendingMatchNotification",
            JSON.stringify(notificationData)
          );

          // カスタムイベントを発火してアプリに通知
          window.dispatchEvent(
            new CustomEvent("pendingNotification", { detail: notificationData })
          );
        } catch (e) {
          console.error("通知データの保存エラー:", e);
        }
      }
    };

    // Service Workerが準備できるまで待つ
    navigator.serviceWorker.ready
      .then((registration) => {
        // Service Workerが準備できたらリスナーを追加
        if (registration.active) {
          navigator.serviceWorker.addEventListener("message", handleMessage);
        }
      })
      .catch((error) => {
        console.error("Service Worker ready error:", error);
      });

    // クリーンアップ関数
    return () => {
      if (navigator.serviceWorker) {
        try {
          navigator.serviceWorker.removeEventListener("message", handleMessage);
        } catch {
          // Service Workerが利用できない場合は無視
        }
      }
    };
  }, []);

  return null;
}
