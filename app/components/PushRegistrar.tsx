// app/components/PushRegistrar.tsx
"use client";

import { useEffect, useRef } from "react";
import { subscribePush } from "@/app/lib/push";

export default function PushRegistrar() {
  const doneRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const trySubscribe = async () => {
      if (doneRef.current) return;

      try {
        // dev: /dev-sw.js があれば登録、なければ無視
        const head = await fetch("/dev-sw.js", { method: "HEAD", cache: "no-store" }).catch(() => null);
        if (head && head.ok) {
          const reg = await navigator.serviceWorker.register("/dev-sw.js", { scope: "/" });
          if (reg.installing) {
            await new Promise<void>((resolve) => {
              reg.installing?.addEventListener("statechange", () => reg.active && resolve());
            });
          } else {
            await navigator.serviceWorker.ready;
          }
        } else {
          // prod: next-pwa による SW 登録を待つ
          await navigator.serviceWorker.ready;
        }

        await subscribePush(); // ← 内部で token チェック
        doneRef.current = true;
      } catch (e) {
        console.error("[PushRegistrar] failed:", e);
      }
    };

    const kick = () => {
      if (doneRef.current) return;
      const token = localStorage.getItem("token");
      if (token) void trySubscribe();
    };

    // 起動時、token があれば即試行
    kick();

    // token 追加を待つ
    const onStorage = (e: StorageEvent) => {
      if (e.key === "token" && e.newValue && !doneRef.current) kick();
    };
    const onFocus = () => {
      if (!doneRef.current) kick();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    // 簡易リトライ（最大 10 回）
    let tries = 0;
    const timerId = window.setInterval(() => {
      if (doneRef.current) {
        window.clearInterval(timerId);
        return;
      }
      tries += 1;
      if (tries > 10) {
        window.clearInterval(timerId);
        return;
      }
      kick();
    }, 1000);

    return () => {
      window.clearInterval(timerId);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}