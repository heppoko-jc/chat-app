// app/admin/diagnose/page.tsx
// 診断ページ - ブラウザからアクセスして診断結果を表示

"use client";

import { useEffect, useState } from "react";

export default function DiagnosePage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDiagnose() {
      try {
        const res = await fetch("/api/admin/diagnose");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = await res.json();
        setResult(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }
    fetchDiagnose();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "20px", fontFamily: "monospace" }}>
        <h1>🔍 診断中...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", fontFamily: "monospace" }}>
        <h1>❌ エラーが発生しました</h1>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <div
      style={{ padding: "20px", fontFamily: "monospace", maxWidth: "1200px" }}
    >
      <h1>🔍 プッシュ通知診断結果</h1>
      <pre
        style={{
          background: "#f5f5f5",
          padding: "15px",
          borderRadius: "5px",
          overflow: "auto",
          fontSize: "12px",
          lineHeight: "1.4",
        }}
      >
        {JSON.stringify(result, null, 2)}
      </pre>

      <div
        style={{
          marginTop: "20px",
          padding: "15px",
          background: "#e8f5e9",
          borderRadius: "5px",
        }}
      >
        <h2>📊 重要なチェックポイント</h2>
        <ul>
          <li>
            環境変数が設定されているか:{" "}
            {result.environment?.has_vapid_public &&
            result.environment?.has_vapid_private
              ? "✅"
              : "❌"}
          </li>
          <li>
            アクティブな購読数: {result.push_subscriptions?.total_active || 0}
          </li>
          <li>
            過去24時間のメッセージ数: {result.messages?.sent_messages_24h || 0}
          </li>
          <li>
            未マッチメッセージ数:{" "}
            {result.unmatched_messages?.unmatched_count || 0}
          </li>
          <li>
            フィード新着があるユーザー数:{" "}
            {result.feed_messages?.total_users_with_feed_new || 0}
          </li>
        </ul>
      </div>

      <div style={{ marginTop: "20px" }}>
        <h2>🚀 次のステップ</h2>
        <p>
          上記の結果をスクリーンショットで保存して、次のURLをテストしてください:
        </p>
        <pre
          style={{
            background: "#f5f5f5",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          /api/cron/digest-17
        </pre>
      </div>
    </div>
  );
}
