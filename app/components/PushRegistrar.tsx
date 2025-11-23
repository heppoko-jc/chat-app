// app/components/PushRegistrar.tsx

"use client";

import { useEffect } from "react";
import { subscribePush } from "@/app/lib/push";

export default function PushRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const MAX_RETRIES = 3;

    const attemptSubscribe = async (attempt: number = 0) => {
      try {
        const isProd = process.env.NODE_ENV === "production";

        if (!isProd) {
          // 開発: もし過去の SW が残ってたら剥がしてキャッシュも消す
          const regs = await navigator.serviceWorker.getRegistrations();
          if (regs.length) {
            await Promise.all(regs.map((r) => r.unregister()));
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          // 開発ではここで終了（SW/Push を使わない）
          return;
        }

        // 本番: next-pwa が登録した SW を待ってから push 購読
        const token = localStorage.getItem("token");
        if (!token) {
          console.info("[PushRegistrar] No token; skip subscribe");
          return; // 未ログインなら購読しない
        }

        // Service Worker の準備を待つ（タイムアウト付き）
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("SW timeout")), 10000)
          ),
        ]);

        const result = await subscribePush();

        if (!result.success && attempt < MAX_RETRIES) {
          // リトライ可能なエラーの場合
          const retryableReasons = [
            "api_error",
            "exception",
            "no_vapid_key",
            "server_side",
          ];

          if (retryableReasons.includes(result.reason || "")) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
            console.log(
              `[PushRegistrar] Retrying in ${delay}ms (attempt ${
                attempt + 1
              }/${MAX_RETRIES}) - reason: ${result.reason}`
            );
            setTimeout(() => attemptSubscribe(attempt + 1), delay);
            return;
          }
        }

        if (result.success) {
          console.log("[PushRegistrar] Successfully subscribed");
        } else {
          console.warn(
            `[PushRegistrar] Subscription failed: ${result.reason}`,
            result.error
          );
        }
      } catch (e) {
        console.error("[PushRegistrar] failed:", e);

        // タイムアウトなどでリトライ可能な場合
        if (
          attempt < MAX_RETRIES &&
          e instanceof Error &&
          e.message === "SW timeout"
        ) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.log(
            `[PushRegistrar] Retrying after timeout in ${delay}ms (attempt ${
              attempt + 1
            }/${MAX_RETRIES})`
          );
          setTimeout(() => attemptSubscribe(attempt + 1), delay);
        }
      }
    };

    attemptSubscribe();
  }, []);

  return null;
}
