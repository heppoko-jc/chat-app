// app/register/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios, { AxiosError } from "axios";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // 既にログイン済みの場合はログインページへ
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.replace("/login");
    }

    // 同意書から名前を取得して初期値として設定
    const consentData = localStorage.getItem("experimentConsent");
    if (consentData) {
      try {
        const consent = JSON.parse(consentData);
        if (consent.participantName) {
          setName(consent.participantName);
        }
      } catch (error) {
        console.error("同意書データの解析エラー:", error);
      }
    }
  }, [router]);

  const handleSkip = async () => {
    // 既存の認証情報をチェック
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");

    if (token && userId) {
      // トークンの有効性をサーバーで確認
      try {
        const res = await fetch("/api/auth/profile", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          // トークンが有効 → メイン画面へ
          router.push("/main");
        } else {
          // トークンが無効 → 削除してログイン画面へ
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          router.push("/login");
        }
      } catch (error) {
        console.error("認証チェックエラー:", error);
        // エラー時はログイン画面へ
        router.push("/login");
      }
    } else {
      // 認証情報なし → ログイン画面へ
      router.push("/login");
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      alert("全ての項目を入力してください");
      return;
    }

    setIsSubmitting(true);

    try {
      // 同意情報を取得
      const consentData = localStorage.getItem("experimentConsent");
      let consentInfo = null;
      
      if (consentData) {
        try {
          consentInfo = JSON.parse(consentData);
        } catch (e) {
          console.error("同意情報の解析エラー:", e);
        }
      }

      // 登録APIを呼び出し（同意情報も含む）
      const res = await axios.post("/api/auth/register", {
        name,
        email,
        password,
        consentInfo: consentInfo
          ? {
              participantName: consentInfo.participantName,
              consentDate: consentInfo.consentDate,
              participation: consentInfo.participation,
              interview: consentInfo.interview,
              dataUsage: consentInfo.dataUsage,
              recordingConsent: consentInfo.recordingConsent,
            }
          : null,
      });
      alert(res.data.message);

      // 登録成功後、PWAインストール指示ページに遷移
      router.push("/pwa-install");
    } catch (err: unknown) {
      const error = err as AxiosError<{ error: string }>;
      const errorMessage = error.response?.data?.error || "Registration failed";

      // 既にアカウントがある場合のエラーメッセージをチェック
      if (
        errorMessage.includes("already in use") ||
        errorMessage.includes("既に登録されています")
      ) {
        // メールアドレスをsessionStorageに保存してからログインページへ
        sessionStorage.setItem("pendingLoginEmail", email);
        alert(
          "このメールアドレスは既に登録されています。ログインページに移動します。"
        );
        router.push("/login");
        return;
      } else {
        alert(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* ヘッダー */}
        <div className="bg-blue-600 text-white p-6">
          <h1 className="text-2xl font-bold text-center">アカウント登録</h1>
        </div>

        {/* フォーム */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              お名前 <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              placeholder="山田太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス <span className="text-red-600">*</span>
            </label>
            <input
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              パスワード <span className="text-red-600">*</span>
            </label>
            <input
              type="password"
              placeholder="8文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isSubmitting}
            />
          </div>

          <button
            onClick={handleRegister}
            disabled={isSubmitting}
            className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors ${
              isSubmitting
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
            }`}
          >
            {isSubmitting ? "登録中..." : "アカウントを作成"}
          </button>

          <div className="pt-4 border-t">
            <button
              onClick={handleSkip}
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors mb-2"
            >
              すでにアカウントを持っているためスキップ
            </button>
            <p className="text-sm text-gray-600 text-center">
              既にアカウントをお持ちですか？{" "}
              <button
                onClick={() => router.push("/login")}
                className="text-blue-600 font-medium hover:underline"
              >
                ログイン
              </button>
            </p>
          </div>

          <p className="text-xs text-gray-600 text-center mt-2">
            登録することで、実験参加同意書の内容に同意したものとみなされます
          </p>
        </div>
      </div>
    </div>
  );
}
