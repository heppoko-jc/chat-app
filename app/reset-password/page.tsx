// app/reset-password/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import Link from "next/link";

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("リセットトークンが無効です");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("新しいパスワードを入力してください");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    if (newPassword.length < 6) {
      setError("パスワードは6文字以上である必要があります");
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post("/api/auth/reset-password", {
        token,
        newPassword,
      });
      setMessage(response.data.message);

      // 3秒後にログインページにリダイレクト
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (error: unknown) {
      console.error("パスワードリセットエラー:", error);
      const axiosError = error as { response?: { data?: { error?: string } } };
      setError(
        axiosError.response?.data?.error || "パスワードのリセットに失敗しました"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-5 max-w-md mx-auto">
      <h1 className="text-xl mb-4">新しいパスワードを設定</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-gray-700">{message}</p>
          <p className="text-sm text-gray-600 mt-2">
            ログインページにリダイレクトします...
          </p>
        </div>
      )}

      {!message && (
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="新しいパスワード（6文字以上）"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="border p-2 w-full mb-3"
            required
            disabled={isLoading}
          />
          <input
            type="password"
            placeholder="パスワード確認"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="border p-2 w-full mb-3"
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
            {isLoading ? "リセット中..." : "パスワードをリセット"}
          </button>
        </form>
      )}

      <div className="mt-4 text-center">
        <Link href="/login" className="text-blue-500 hover:underline">
          ログインページに戻る
        </Link>
      </div>
    </div>
  );
}
