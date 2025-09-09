// app/components/SWVisibilityPinger.tsx
"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** 現在のパスから画面種別と chatId を推定 */
function parseScreen(
  path: string
): { screen: "chat" | "chat-list" | "notifications" | "other"; chatId?: string } {
  if (path === "/chat-list") return { screen: "chat-list" };
  if (path === "/notifications") return { screen: "notifications" };
  if (path === "/main") return { screen: "other" }; // メイン画面用に other 扱い（抑制は“前面なら常に”で見る想定）
  const m = path.match(/^\/chat\/([^/]+)\/?$/);
  if (m) return { screen: "chat", chatId: m[1] };
  return { screen: "other" };
}

/** SWへ postMessage（ready.active or controller のどちらかへ） */
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

/** iOS 対策など：SW の fetch('/__sw/fg') で拾えるよう sendBeacon でも前面状態を送る */
function beaconToSW(payload: Record<string, unknown>) {
  try {
    if (!("sendBeacon" in navigator)) return;
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    // SW 側で `self.addEventListener('fetch', ...)` などで受ける前提の仮想エンドポイント
    // SW が未対応でも問題なし（ネットワークへ投げて終わり）
    navigator.sendBeacon("/__sw/fg", blob);
  } catch {
    // noop
  }
}

export default function SWVisibilityPinger() {
  const pathname = usePathname() || "/";
  const heartbeatRef = useRef<number | null>(null);

  const send = useCallback(() => {
    const { screen, chatId } = parseScreen(pathname);
    const payload = {
      type: "FOREGROUND_STATE",
      at: Date.now(),
      // iOS PWA は visible/focus が不正確なことがあるため、SW 側は path + TTL を主に使う
      visible: typeof document !== "undefined" ? document.visibilityState === "visible" : false,
      focused:
        typeof document !== "undefined" && typeof document.hasFocus === "function"
          ? document.hasFocus()
          : false,
      path: pathname,
      screen,
      chatId,
    };

    // 1) postMessage（標準ルート：Chrome/Android など）
    postToSW(payload);

    // 2) sendBeacon（iOS/Safari PWA 対策のフォールバック。SW 側が対応していれば拾える）
    beaconToSW(payload);
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

    // 軽いユーザー操作でも心拍を送っておく（iOS で visible が安定しない場合の補助）
    const onPointerDown = () => send();
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pointerdown", onPointerDown as EventListener);
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