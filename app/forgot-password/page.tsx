// app/forgot-password/page.tsx

"use client";
import { useState } from "react";
import axios from "axios";
import Link from "next/link";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      alert("メールアドレスを入力してください");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const response = await axios.post("/api/auth/forgot-password", { email });
      setMessage(response.data.message);

      // コンソールにトークンを表示（デバッグ用）
      // 本番環境ではメールで送信
      console.log("📧 パスワードリセット用のトークンが送信されました");
    } catch (error: unknown) {
      console.error("パスワードリセットエラー:", error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setMessage(
        axiosError.response?.data?.error || "パスワードリセットに失敗しました"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-5 max-w-md mx-auto">
      <h1 className="text-xl mb-4">パスワードを忘れた場合</h1>

      {message && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-gray-700">{message}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 w-full mb-4"
          required
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className={`p-2 w-full text-white mb-4 ${
            isLoading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700"
          }`}
        >
          {isLoading ? "送信中..." : "リセットリンクを送信"}
        </button>
      </form>

      <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-gray-700">
          ⚠️ <strong>注意:</strong>{" "}
          パスワードリセットリンクはコンソールに出力されます。
          本番環境では、メール送信機能を実装する必要があります。
        </p>
      </div>

      <div className="mt-4 text-center">
        <Link href="/login" className="text-blue-500 hover:underline">
          ログインページに戻る
        </Link>
      </div>
    </div>
  );
}
