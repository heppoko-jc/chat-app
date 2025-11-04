"use client";

import { useState } from "react";

export default function HideByKeywordsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<{
    found?: {
      totalMessages: number;
      messagesToHide: number;
      keywordList: string[];
    };
    sampleMessages?: Array<{ id: string; message: string }>;
  } | null>(null);

  // 管理者APIキー（環境変数から取得、またはデフォルト値）
  const adminApiKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123";

  // ドライラン: キーワードを含むメッセージを検索
  const handleDryRun = async () => {
    console.log("🔍 [CLIENT] handleDryRun called");
    setLoading(true);
    setResult(null);
    setDryRunResult(null);

    try {
      const url = "/api/admin/hide-messages-by-keywords";
      const requestBody = { dryRun: true };

      console.log("🔍 [CLIENT] Fetching:", url);
      console.log("🔍 [CLIENT] Admin API Key:", adminApiKey);
      console.log("🔍 [CLIENT] Request body:", requestBody);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log(
        "🔍 [CLIENT] Response status:",
        response.status,
        response.statusText
      );
      console.log(
        "🔍 [CLIENT] Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      let data;
      const responseText = await response.text();
      console.log("🔍 [CLIENT] Response text:", responseText);

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("🔍 [CLIENT] JSON parse error:", parseError);
        setResult(
          `❌ レスポンスの解析に失敗しました\nレスポンス: ${responseText.substring(
            0,
            200
          )}`
        );
        setLoading(false);
        return;
      }

      console.log("🔍 [CLIENT] Parsed data:", data);

      if (response.ok) {
        if (data.found) {
          setDryRunResult(data);
          setResult(
            `🔍 検索結果:\n総メッセージ数: ${
              data.found.totalMessages || 0
            }件\n非表示対象: ${
              data.found.messagesToHide || 0
            }件\n\nキーワード: ${
              data.found.keywordList?.join(", ") || "未設定"
            }`
          );
        } else {
          setResult(
            `❌ 予期しないレスポンス形式\nデータ: ${JSON.stringify(
              data,
              null,
              2
            )}`
          );
        }
      } else {
        setResult(
          `❌ エラー (${response.status}): ${
            data.error || "Unknown error"
          }\n詳細: ${data.details || JSON.stringify(data, null, 2)}`
        );
      }
    } catch (error) {
      console.error("🔍 [CLIENT] Fetch error:", error);
      setResult(
        `❌ ネットワークエラー: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setLoading(false);
      console.log("🔍 [CLIENT] handleDryRun finished");
    }
  };

  // 実際に非表示にする
  const handleHide = async () => {
    if (
      !confirm("本当にキーワードを含む過去のメッセージを非表示にしますか？")
    ) {
      return;
    }

    setLoading(true);
    setResult(null);
    setDryRunResult(null);

    try {
      const response = await fetch("/api/admin/hide-messages-by-keywords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminApiKey}`,
        },
        body: JSON.stringify({ dryRun: false }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(
          `✅ 完了: ${
            data.hidden.count
          }件のメッセージを非表示にしました\n\nキーワード: ${data.keywordList.join(
            ", "
          )}`
        );
      } else {
        setResult(
          `❌ エラー: ${data.error || "Unknown error"}\n${data.details || ""}`
        );
      }
    } catch (error) {
      setResult(`❌ エラー: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">キーワード非表示機能</h1>
        {/* Updated: 2025-11-04 */}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            過去のメッセージを非表示にする
          </h2>
          <p className="text-gray-600 mb-4">
            環境変数{" "}
            <code className="bg-gray-100 px-2 py-1 rounded">
              HIDDEN_KEYWORDS
            </code>{" "}
            に設定されたキーワードを含む過去のメッセージを非表示にします。
          </p>

          <div className="flex gap-4 mb-4">
            <button
              onClick={handleDryRun}
              disabled={loading}
              className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? "検索中..." : "🔍 検索（ドライラン）"}
            </button>
            <button
              onClick={handleHide}
              disabled={loading}
              className="px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
            >
              {loading ? "処理中..." : "🚀 非表示にする"}
            </button>
          </div>

          {result && (
            <div className="mt-4 p-4 bg-gray-100 rounded whitespace-pre-line">
              {result}
            </div>
          )}

          {!result && !loading && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              💡 ヒント: 「🔍
              検索（ドライラン）」ボタンをクリックして、キーワードを含むメッセージを検索します。
              <br />
              ブラウザのコンソール（F12）で詳細なログを確認できます。
            </div>
          )}

          {dryRunResult && dryRunResult.sampleMessages && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">
                サンプルメッセージ（最初の10件）:
              </h3>
              <div className="space-y-2">
                {dryRunResult.sampleMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm"
                  >
                    <div className="font-mono text-xs text-gray-500 mb-1">
                      ID: {msg.id}
                    </div>
                    <div className="text-gray-800">{msg.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📝 使い方</h3>
          <ol className="list-decimal list-inside space-y-2 text-blue-800">
            <li>
              <strong>検索（ドライラン）</strong>
              をクリックして、非表示対象のメッセージ数を確認します
            </li>
            <li>
              サンプルメッセージを確認して、正しいキーワードが設定されているか確認します
            </li>
            <li>
              <strong>非表示にする</strong>をクリックして、実際に非表示にします
            </li>
          </ol>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <h3 className="font-semibold text-yellow-900 mb-2">⚠️ 注意事項</h3>
          <ul className="list-disc list-inside space-y-1 text-yellow-800">
            <li>この操作は取り消せません（非表示の解除は別のAPIで可能です）</li>
            <li>
              大量のメッセージを処理する場合、時間がかかる可能性があります
            </li>
            <li>
              キーワードは環境変数{" "}
              <code className="bg-yellow-100 px-1 rounded">
                HIDDEN_KEYWORDS
              </code>{" "}
              で設定してください（カンマ区切り、例:{" "}
              <code className="bg-yellow-100 px-1 rounded">死にたい,自殺</code>
              ）
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
