"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** 現在のパスから画面種別と chatId を推定 */
function parseScreen(path: string): { screen: "chat" | "chat-list" | "notifications" | "other"; chatId?: string } {
  if (path === "/chat-list") return { screen: "chat-list" };
  if (path === "/notifications") return { screen: "notifications" };
  const m = path.match(/^\/chat\/([^/]+)\/?$/);
  if (m) return { screen: "chat", chatId: m[1] };
  return { screen: "other" };
}

/** SWへポスト（ready.active or controller のどちらかへ） */
async function postToSW(msg: unknown) {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready; // active になるまで待つ
    if (reg?.active) {
      reg.active.postMessage(msg);
      return;
    }
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }
  } catch {
    // noop
  }
}

export default function SWVisibilityPinger() {
  const pathname = usePathname() || "/";
  const heartbeatRef = useRef<number | null>(null);

  const send = useCallback(() => {
    const { screen, chatId } = parseScreen(pathname);
    postToSW({
      type: "FOREGROUND_STATE",
      at: Date.now(),
      // iOS PWA は visible が常に hidden なことがあるので、SW 側は path を主に見る
      visible: document.visibilityState === "visible",
      focused: typeof document.hasFocus === "function" ? document.hasFocus() : false,
      path: pathname,
      screen,
      chatId,
    });
  }, [pathname]);

  // 1) ルート変更時：即送信
  useEffect(() => {
    send();
  }, [send]);

  // 2) 可視状態/フォーカスの変化：即送信
  useEffect(() => {
    const onVisibility = () => send();
    const onFocus = () => send();
    const onBlur = () => send();
    const onPageShow = () => send();
    const onPageHide = () => send(); // iOS Safari PWA 対策

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [send]);

  // 3) ハートビート（5 秒ごと）
  useEffect(() => {
    send(); // すぐに一発
    heartbeatRef.current = window.setInterval(send, 5000);
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [send]);

  return null;
}