// app/page.tsx b

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const checkAndRedirect = async () => {
      // 0. PWAインストール確認
      const pwaInstallAcknowledged = localStorage.getItem(
        "pwaInstallAcknowledged"
      );
      if (!pwaInstallAcknowledged) {
        if (!cancelled) router.replace("/pwa-install");
        return;
      }

      // 1. まず同意書チェック
      const consentData = localStorage.getItem("experimentConsent");
      if (!consentData) {
        if (!cancelled) router.replace("/consent");
        return;
      }

      let consent;
      try {
        consent = JSON.parse(consentData);
        if (!consent.consentGiven) {
          if (!cancelled) router.replace("/consent");
          return;
        }
        // 名前が入力されているかチェック
        if (!consent.participantName || consent.participantName.trim() === "") {
          if (!cancelled) router.replace("/consent");
          return;
        }
      } catch {
        // 不正なデータがあれば同意書からやり直し
        localStorage.removeItem("experimentConsent");
        if (!cancelled) router.replace("/consent");
        return;
      }

      // 2. 同意済みなら認証チェック
      const token = localStorage.getItem("token");
      const userId = localStorage.getItem("userId");

      // トークン／userId が無ければログイン画面へ
      if (!token || !userId) {
        if (!cancelled) router.replace("/login");
        return;
      }

      // 3. トークンの有効性をサーバーへ問い合わせ
      try {
        const res = await fetch("/api/auth/profile", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (res.ok) {
          // 有効 → メイン画面へ
          router.replace("/main");
        } else {
          // 無効／期限切れ → localStorage クリアしてログインへ
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          router.replace("/login");
        }
      } catch {
        if (cancelled) return;
        // ネットワークエラー等もログイン画面へ
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        router.replace("/login");
      }
    };

    checkAndRedirect();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center justify-center h-screen bg-white">
      <Image
        src="/app_icon.PNG"
        alt="App Icon"
        width={120}
        height={120}
        priority
      />
    </div>
  );
}
