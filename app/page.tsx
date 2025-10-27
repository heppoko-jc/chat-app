// app/page.tsx b

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // 1. まず同意書チェック
    const consentData = localStorage.getItem("experimentConsent");
    if (!consentData) {
      router.replace("/consent");
      return;
    }

    try {
      const consent = JSON.parse(consentData);
      if (!consent.consentGiven) {
        router.replace("/consent");
        return;
      }
    } catch (error) {
      // 不正なデータがあれば同意書からやり直し
      localStorage.removeItem("experimentConsent");
      router.replace("/consent");
      return;
    }

    // 2. 同意済みなら認証チェック
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    // トークン／userId が無ければログイン画面へ
    if (!token || !userId) {
      router.replace("/login");
      return;
    }

    // 3. トークンの有効性をサーバーへ問い合わせ
    fetch("/api/auth/profile", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) {
          // 有効 → メイン画面へ
          router.replace("/main");
        } else {
          // 無効／期限切れ → localStorage クリアしてログインへ
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          router.replace("/login");
        }
      })
      .catch(() => {
        // ネットワークエラー等もログイン画面へ
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        router.replace("/login");
      });
  }, [router]);

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
