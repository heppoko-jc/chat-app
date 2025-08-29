// app/components/SWVisibilityPinger.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * 現在のパスから画面種別と chatId を推定
 */
function parseScreen(path: string): { screen: "chat" | "chat-list" | "notifications" | "other"; chatId?: string } {
  if (path === "/chat-list") return { screen: "chat-list" };
  if (path === "/notifications") return { screen: "notifications" };
  const m = path.match(/^\/chat\/([^/]+)\/?$/);
  if (m) return { screen: "chat", chatId: m[1] };
  return { screen: "other" };
}

/**
 * SWへポスト（ready.active or controller のどちらかへ）
 */
async function postToSW(msg: unknown) {
  try {
    if (!("serviceWorker" in navigator)) return;
    // ready.active を優先（Safari PWA だと controller が null の時がある）
    const reg = await navigator.serviceWorker.ready;
    if (reg?.active) {
      reg.active.postMessage(msg);
      return;
    }
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
  } catch {
    // noop（失敗してもアプリ動作には影響なし）
  }
}

export default function SWVisibilityPinger() {
  const pathname = usePathname() || "/";
  const heartbeatRef = useRef<number | null>(null);

  // 1) ルート変更時：即送信
  useEffect(() => {
    const { screen, chatId } = parseScreen(pathname);
    postToSW({
      type: "FOREGROUND_STATE",
      at: Date.now(),
      visible: document.visibilityState === "visible",
      focused: typeof document.hasFocus === "function" ? document.hasFocus() : false,
      path: pathname,
      screen,
      chatId,
    });
  }, [pathname]);

  // 2) 可視状態/フォーカスの変化：即送信
  useEffect(() => {
    const send = () => {
      const { screen, chatId } = parseScreen(pathname);
      postToSW({
        type: "FOREGROUND_STATE",
        at: Date.now(),
        visible: document.visibilityState === "visible",
        focused: typeof document.hasFocus === "function" ? document.hasFocus() : false,
        path: pathname,
        screen,
        chatId,
      });
    };

    const onVisibility = () => send();
    const onFocus = () => send();
    const onBlur = () => send();
    const onPageHide = () => send(); // iOS Safari PWA 対策

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname]);

  // 3) ハートビート（15 秒ごと）
  useEffect(() => {
    const tick = () => {
      const { screen, chatId } = parseScreen(pathname);
      postToSW({
        type: "FOREGROUND_STATE",
        at: Date.now(),
        visible: document.visibilityState === "visible",
        focused: typeof document.hasFocus === "function" ? document.hasFocus() : false,
        path: pathname,
        screen,
        chatId,
      });
    };

    // すぐに一発
    tick();

    // 15秒ごと
    heartbeatRef.current = window.setInterval(tick, 15000);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [pathname]);

  return null;
}