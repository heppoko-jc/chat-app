// app/page.tsx

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    // トークン／userId が無ければ即ログイン画面へ
    if (!token || !userId) {
      router.replace("/login");
      return;
    }

    // トークンの有効性をサーバーへ問い合わせ
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