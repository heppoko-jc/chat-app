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

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
