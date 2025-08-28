// app/components/PushRegistrar.tsx
"use client";

import { useEffect } from "react";
import { subscribePush } from "@/app/lib/push";

const USE_DEV_SW = process.env.NEXT_PUBLIC_USE_DEV_SW === "1"; // ← .env.local のみで設定

export default function PushRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      try {
        const isProd = process.env.NODE_ENV === "production";
        const token = localStorage.getItem("token");

        // 本番で dev-sw.js が誤って残っていたら即剥がす
        if (isProd) {
          const regs = await navigator.serviceWorker.getRegistrations();
          const hadDev = regs.some((r) => r.active?.scriptURL.includes("/dev-sw.js"));
          if (hadDev) {
            await Promise.all(regs
              .filter((r) => r.active?.scriptURL.includes("/dev-sw.js"))
              .map((r) => r.unregister()));
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
            // dev-sw を外したら SW 不整合を避けるために 1 度だけリロード
            window.location.reload();
            return;
          }
        }

        // 未ログインなら Push 購読はしない（SW 自体は next-pwa が登録）
        if (!token) return;

        if (!isProd && USE_DEV_SW) {
          // 開発 + 明示フラグあり なら dev-sw を登録
          const head = await fetch("/dev-sw.js", { method: "HEAD", cache: "no-store" });
          if (!head.ok) return;

          const reg = await navigator.serviceWorker.register("/dev-sw.js", { scope: "/" });
          if (reg.installing) {
            await new Promise<void>((resolve) => {
              reg.installing?.addEventListener("statechange", () => reg.active && resolve());
            });
          } else {
            await navigator.serviceWorker.ready;
          }
          await subscribePush();
          return;
        }

        // 本番 or 開発でも dev-sw を使わない場合：next-pwa の SW を待って購読
        await navigator.serviceWorker.ready;
        await subscribePush();
      } catch (e) {
        console.error("[PushRegistrar] failed:", e);
      }
    })();
  }, []);

  return null;
}