"use client";

import { useState } from "react";

export default function SendNotificationPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSend = async () => {
    if (!title || !body) {
      alert("タイトルと本文を入力してください");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // 環境変数からAPIキーを取得（ビルド時に解決される）
      const apiKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123";

      const response = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ title, body, url, type: "update" }),
      });

      // レスポンスがJSONかどうかを確認
      const contentType = response.headers.get("content-type");
      let data;

      if (contentType && contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (jsonError) {
          // JSONパースに失敗した場合
          setResult(
            `❌ エラー: サーバーからの応答を解析できませんでした\nステータス: ${response.status} ${response.statusText}`
          );
          console.error("JSON Parse Error:", jsonError);
          return;
        }
      } else {
        // JSON以外のレスポンスの場合
        const text = await response.text();
        setResult(
          `❌ エラー: 予期しない応答形式\nステータス: ${response.status} ${
            response.statusText
          }\n応答: ${text.substring(0, 200)}`
        );
        console.error("Unexpected response format:", text);
        return;
      }

      if (response.ok) {
        if (data.stats) {
          setResult(
            `✅ 送信完了: ${data.message}\n📊 統計: 成功 ${data.stats.success}件, 失敗 ${data.stats.failed}件, 無効化 ${data.stats.deactivated}件`
          );
        } else {
          setResult(`✅ ${data.message || "送信完了"}`);
        }
        setTitle("");
        setBody("");
        setUrl("/");
      } else {
        // エラーメッセージを詳細に表示
        const errorMsg = data.error || "不明なエラーが発生しました";
        const details = data.details ? `\n詳細: ${data.details}` : "";
        const statusMsg = `\nステータス: ${response.status} ${response.statusText}`;
        setResult(`❌ エラー: ${errorMsg}${details}${statusMsg}`);
        console.error("API Error:", {
          status: response.status,
          statusText: response.statusText,
          data,
        });
      }
    } catch (error) {
      // ネットワークエラーなどの詳細を表示
      const errorMsg = error instanceof Error ? error.message : String(error);
      setResult(`❌ エラー: リクエストに失敗しました\n詳細: ${errorMsg}`);
      console.error("Request Error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">
          📱 プッシュ通知送信
        </h1>

        <div className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-blue-800 text-sm">
              💡 このページからユーザー全員にプッシュ通知を送信できます
            </p>
          </div>

          <div>
            <label className="block text-lg font-medium mb-3 text-gray-700">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
              placeholder="例: アプリアップデート"
              maxLength={50}
            />
            <p className="text-sm text-gray-500 mt-1">{title.length}/50文字</p>
          </div>

          <div>
            <label className="block text-lg font-medium mb-3 text-gray-700">
              本文 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full p-4 border-2 border-gray-300 rounded-lg h-32 text-lg focus:border-blue-500 focus:outline-none resize-none"
              placeholder="例: 新機能が追加されました！詳細はこちらをご確認ください。"
              maxLength={200}
            />
            <p className="text-sm text-gray-500 mt-1">{body.length}/200文字</p>
          </div>

          <div>
            <label className="block text-lg font-medium mb-3 text-gray-700">
              リンク先URL（任意）
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
              placeholder="/"
            />
            <p className="text-sm text-gray-500 mt-1">
              アプリ内のページパスを入力してください（例: /main, /profile）
            </p>
          </div>

          <button
            onClick={handleSend}
            disabled={loading || !title || !body}
            className="w-full bg-blue-600 text-white p-4 rounded-lg text-lg font-medium disabled:bg-gray-400 hover:bg-blue-700 transition-colors"
          >
            {loading ? "📤 送信中..." : "📤 プッシュ通知を送信"}
          </button>

          {result && (
            <div
              className={`p-4 rounded-lg text-lg whitespace-pre-line ${
                result.startsWith("✅")
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {result}
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-gray-600">
          <p>🔧 PCのブラウザから簡単に送信できます</p>
          <p>📱 通知はアプリを使用中の全ユーザーに送信されます</p>
        </div>
      </div>
    </div>
  );
}
