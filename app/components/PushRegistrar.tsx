// app/components/PushRegistrar.tsx

"use client";

import { useEffect } from "react";
import { subscribePush } from "@/app/lib/push";

export default function PushRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    (async () => {
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
        if (!token) return; // 未ログインなら購読しない

        await navigator.serviceWorker.ready;
        await subscribePush();
      } catch (e) {
        console.error("[PushRegistrar] failed:", e);
      }
    })();
  }, []);

  return null;
}
