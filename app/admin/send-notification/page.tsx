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
      const response = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${
            process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123"
          }`,
        },
        body: JSON.stringify({ title, body, url, type: "update" }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(
          `✅ 送信完了: ${data.message}\n📊 統計: 成功 ${data.stats.success}件, 失敗 ${data.stats.failed}件, 無効化 ${data.stats.deactivated}件`
        );
        setTitle("");
        setBody("");
        setUrl("/");
      } else {
        setResult(`❌ エラー: ${data.error}`);
      }
    } catch (error) {
      setResult(`❌ エラー: ${error}`);
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
            <div className="p-4 bg-gray-100 rounded-lg text-lg whitespace-pre-line">
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
