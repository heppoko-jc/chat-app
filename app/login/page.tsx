// app/login/page.tsx

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios, { AxiosError } from "axios";
import { subscribePush } from "@/app/lib/push";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const router = useRouter();

  // Service Worker とキャッシュをクリーンアップ（開発環境での問題回避）
  useEffect(() => {
    const cleanup = async () => {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        try {
          // すべての Service Worker を削除
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
            console.log(
              "✅ Service Worker を削除しました:",
              registration.scope
            );
          }

          // すべてのキャッシュを削除
          let cacheNames: string[] = [];
          if ("caches" in window) {
            cacheNames = await caches.keys();
            for (const cacheName of cacheNames) {
              await caches.delete(cacheName);
              console.log("✅ キャッシュを削除しました:", cacheName);
            }
          }

          if (registrations.length > 0 || cacheNames.length > 0) {
            console.log("🔄 ページを再読み込みしてください");
            // 自動再読み込み（オプション: コメントアウトしたままでもOK）
            // window.location.reload();
          }
        } catch (error) {
          console.error("⚠️ クリーンアップエラー:", error);
        }
      }
    };
    cleanup();
  }, []);

  // 登録ページから来た場合、メールアドレスを事前入力
  useEffect(() => {
    const pendingEmail = sessionStorage.getItem("pendingLoginEmail");
    if (pendingEmail) {
      setEmail(pendingEmail);
      sessionStorage.removeItem("pendingLoginEmail");
    }
  }, []);

  const handleLogin = async () => {
    console.log("🔵 ログイン開始", { email: email.substring(0, 3) + "***" });

    // 入力チェック
    if (!email.trim() || !password.trim()) {
      const msg =
        "メールアドレス（またはユーザー名）とパスワードを入力してください。";
      console.log("⚠️ 入力チェック失敗:", msg);
      setErrorMessage(msg);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      console.log("📡 ログインAPIを呼び出し中...", { identifier: email });
      const response = await axios.post("/api/auth/login", { email, password });

      console.log("✅ ログインレスポンス受信:", {
        hasUserId: !!response.data?.userId,
        hasToken: !!response.data?.token,
        loginMatchedBy: response.data?.loginMatchedBy,
      });

      if (!response.data?.userId || !response.data?.token) {
        const msg = `ログインに失敗しました (userId または token が取得できません)。レスポンス: ${JSON.stringify(
          response.data
        )}`;
        console.error("🚨", msg);
        setErrorMessage(msg);
        setIsLoading(false);
        return;
      }

      localStorage.setItem("userId", response.data.userId);
      localStorage.setItem("token", response.data.token);
      console.log("✅ ローカルストレージに保存完了");

      try {
        await subscribePush();
      } catch (pushError) {
        console.warn(
          "⚠️ プッシュ通知の登録に失敗しましたが、ログインは続行します:",
          pushError
        );
      }

      console.log("✅ ログイン成功、メインページへ遷移");
      router.push("/main");
    } catch (err: unknown) {
      console.error("🚨 ログインエラー詳細:", err);

      let errorMsg = "ログインに失敗しました";

      if (axios.isAxiosError(err)) {
        const error = err as AxiosError<{
          error: string;
          reason?: string;
          searchedBy?: string;
        }>;

        console.log("📊 エラー情報:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message,
          code: error.code,
        });

        const reason = error.response?.data?.reason;
        if (reason === "USER_NOT_FOUND") {
          errorMsg = `アカウントが見つかりません（識別子: ${email}）。\n入力内容をご確認ください。未登録の場合は新規登録をお願いします。`;
        } else if (reason === "INVALID_PASSWORD") {
          errorMsg =
            "パスワードが間違っています。大文字小文字・全角半角をご確認ください。再設定も可能です。";
        } else if (error.response?.data?.error) {
          errorMsg = `ログインに失敗しました: ${error.response.data.error}`;
        } else if (
          error.code === "ECONNABORTED" ||
          error.code === "ETIMEDOUT"
        ) {
          errorMsg =
            "接続がタイムアウトしました。ネットワークを確認して再度お試しください。";
        } else if (error.code === "ERR_NETWORK") {
          errorMsg =
            "ネットワークエラーが発生しました。サーバーに接続できません。";
        } else {
          errorMsg = `ログインに失敗しました: ${
            error.message || "不明なエラー"
          }`;
        }
      } else if (err instanceof Error) {
        errorMsg = `ログインに失敗しました: ${err.message}`;
      } else {
        errorMsg = `ログインに失敗しました: ${String(err)}`;
      }

      console.error("🚨 設定するエラーメッセージ:", errorMsg);
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
      console.log("🔵 ログイン処理終了");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🔵 フォーム送信イベント発生");
    handleLogin();
  };

  const handlePasswordReset = async () => {
    if (!resetIdentifier.trim() || !resetPassword.trim()) {
      setResetMessage("識別子と新しいパスワードを入力してください");
      return;
    }

    if (resetPassword.length < 6) {
      setResetMessage("パスワードは6文字以上である必要があります");
      return;
    }

    setIsResetting(true);
    setResetMessage(null);

    try {
      const response = await axios.post("/api/admin/reset-user-password", {
        identifier: resetIdentifier,
        newPassword: resetPassword,
      });

      setResetMessage(
        `✅ パスワードが正常にリセットされました！\n\nユーザー: ${
          response.data.user?.email || response.data.user?.name
        }\n新しいパスワード: ${resetPassword}\n\nこのパスワードでログインできます。`
      );
      setResetIdentifier("");
      setResetPassword("");
    } catch (err: unknown) {
      const error = err as AxiosError<{ error: string }>;
      setResetMessage(
        `❌ パスワードリセットに失敗しました: ${
          error.response?.data?.error || error.message
        }`
      );
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="p-5">
      <h1 className="text-xl mb-2">Login</h1>
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-3 p-3 rounded-lg border-2 border-red-400 bg-red-100 text-red-800 text-sm font-medium whitespace-pre-line shadow-md"
          style={{ minHeight: "50px" }}
        >
          <strong>⚠️ エラー:</strong> {errorMessage}
        </div>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <input
          type="text"
          name="identifier"
          placeholder="ユーザー名またはメールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 w-full mb-2"
          required
          autoComplete="username"
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

      <div className="mt-3 text-center">
        <Link
          href="/forgot-password"
          className="text-sm text-blue-500 hover:underline"
        >
          パスワードを忘れた方はこちら
        </Link>
      </div>

      <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-gray-700 text-center">
          うまくログインができない場合は、一度アプリを閉じてもう一度開くとうまくいくことが多いです！
        </p>
      </div>

      {/* 開発/許可フラグ有効時のパスワードリセット機能 */}
      <div className="mt-4 p-3 bg-gray-50 border border-gray-300 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-600 font-medium">
            🔧 開発者向け: パスワードリセット
          </p>
          <button
            type="button"
            onClick={() => {
              console.log("🔵 パスワードリセットトグルクリック", {
                before: showPasswordReset,
              });
              setShowPasswordReset(!showPasswordReset);
            }}
            className="text-xs text-blue-600 hover:underline cursor-pointer"
          >
            {showPasswordReset ? "閉じる" : "開く"}
          </button>
        </div>

        {showPasswordReset && (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              placeholder="メールアドレスまたはユーザー名（例: taichi）"
              value={resetIdentifier}
              onChange={(e) => setResetIdentifier(e.target.value)}
              className="border p-2 w-full text-sm"
              disabled={isResetting}
            />
            <input
              type="password"
              placeholder="新しいパスワード（6文字以上）"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="border p-2 w-full text-sm"
              disabled={isResetting}
            />
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={isResetting}
              className={`w-full p-2 text-sm text-white rounded ${
                isResetting
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {isResetting ? "リセット中..." : "パスワードをリセット"}
            </button>
            {resetMessage && (
              <div
                className={`p-2 rounded text-xs whitespace-pre-line ${
                  resetMessage.startsWith("✅")
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : "bg-red-100 text-red-800 border border-red-300"
                }`}
              >
                {resetMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
