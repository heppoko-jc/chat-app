// app/login/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios, { AxiosError } from "axios";
import { subscribePush } from "@/app/lib/push";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // 登録ページから来た場合、メールアドレスを事前入力
  useEffect(() => {
    const pendingEmail = sessionStorage.getItem("pendingLoginEmail");
    if (pendingEmail) {
      setEmail(pendingEmail);
      sessionStorage.removeItem("pendingLoginEmail");
    }
  }, []);

  const handleLogin = async () => {
    console.log("ログイン開始");

    // 入力チェック
    if (!email.trim() || !password.trim()) {
      alert("メールアドレスとパスワードを入力してください");
      return;
    }

    setIsLoading(true);

    try {
      console.log("ログインAPIを呼び出し中...", { email });
      const response = await axios.post("/api/auth/login", { email, password });

      console.log("ログインレスポンス：", response.data);
      if (!response.data.userId || !response.data.token) {
        console.error("🚨 userId または token がレスポンスに含まれていません");
        alert("ログインに失敗しました (userId または token が取得できません)");
        return;
      }

      localStorage.setItem("userId", response.data.userId);
      localStorage.setItem("token", response.data.token); // ✅ token を保存
      console.log("ローカルストレージに保存完了");

      await subscribePush();
      alert("Login successful!");
      router.push("/main");
    } catch (err: unknown) {
      console.error("ログインエラー:", err);
      const error = err as AxiosError<{ error: string }>;
      alert(error.response?.data?.error || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin();
  };

  return (
    <div className="p-5">
      <h1 className="text-xl mb-2">Login</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 w-full mb-2"
          required
          disabled={isLoading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 w-full mb-2"
          required
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className={`p-2 w-full text-white ${
            isLoading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 active:bg-blue-700"
          }`}
        >
          {isLoading ? "ログイン中..." : "Login"}
        </button>
      </form>

      <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-gray-700 text-center">
          うまくログインができない場合は、一度アプリを閉じてもう一度開くとうまくいくことが多いです！
        </p>
      </div>
    </div>
  );
}
