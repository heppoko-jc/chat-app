// app/login/page.tsx

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios, { AxiosError } from "axios";
import { subscribePush } from "@/app/lib/push";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    try {
      const response = await axios.post("/api/auth/login", { email, password });

      console.log("ログインレスポンス：", response.data);
      if (!response.data.userId || !response.data.token) {
        console.error("🚨 userId または token がレスポンスに含まれていません");
        alert("ログインに失敗しました (userId または token が取得できません)");
        return;
      }

      localStorage.setItem("userId", response.data.userId);
      localStorage.setItem("token", response.data.token); // ✅ token を保存
      await subscribePush(); 
      alert("Login successful!");
      router.push("/main");
    } catch (err: unknown) {
      const error = err as AxiosError<{ error: string }>;
      alert(error.response?.data?.error || "Login failed");
    }
  };

  return (
    <div className="p-5">
      <h1 className="text-xl mb-2">Login</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 w-full mb-2"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 w-full mb-2"
      />
      <button onClick={handleLogin} className="bg-blue-500 text-white p-2 w-full">
        Login
      </button>
    </div>
  );
}
