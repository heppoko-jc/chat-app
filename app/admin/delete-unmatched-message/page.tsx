"use client";

import { useState } from "react";

export default function DeleteUnmatchedMessagePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{
    unmatchedMessages: Array<{
      id: string;
      message: string;
      senderId: string;
      receiverId: string;
      createdAt: string;
      sender: { id: string; name: string; email: string };
      receiver: { id: string; name: string; email: string };
      linkTitle?: string;
      linkImage?: string;
    }>;
    count: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  // 管理者APIキー（環境変数から取得、またはデフォルト値）
  const adminApiKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-key-123";

  // メッセージを検索
  const handleSearch = async () => {
    setLoading(true);
    setSearchResult(null);
    setMessage(null);

    try {
      const url = searchQuery.trim()
        ? `/api/admin/search-unmatched-messages?message=${encodeURIComponent(
            searchQuery
          )}`
        : `/api/admin/search-unmatched-messages`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${adminApiKey}`,
        },
      });

      const data = await response.json();
      if (response.ok) {
        setSearchResult(data);
        if (data.count === 0) {
          setMessage("該当する未マッチメッセージが見つかりませんでした");
        }
      } else {
        setMessage(`検索エラー: ${data.error}`);
      }
    } catch (error) {
      setMessage(`エラー: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // メッセージを削除
  const handleDelete = async (messageId: string) => {
    if (
      !confirm(
        "本当にこの未マッチメッセージを削除しますか？この操作は取り消せません。"
      )
    ) {
      return;
    }

    setLoading(true);
    setDeleteResult(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/delete-unmatched-message", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminApiKey}`,
        },
        body: JSON.stringify({ messageId }),
      });

      const data = await response.json();
      if (response.ok) {
        setDeleteResult(
          `✅ 削除成功\n削除された未マッチメッセージ: ${data.deleted.unmatchedMessages}件\nPresetMessage更新: ${data.deleted.presetMessageUpdates}件`
        );
        // 検索結果を更新
        if (searchResult) {
          setSearchResult({
            ...searchResult,
            unmatchedMessages: searchResult.unmatchedMessages.filter(
              (msg) => msg.id !== messageId
            ),
            count: searchResult.count - 1,
          });
        }
      } else {
        setDeleteResult(`❌ 削除エラー: ${data.error}\n${data.details || ""}`);
      }
    } catch (error) {
      setDeleteResult(`❌ エラー: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // メッセージを非表示にする
  const handleHide = async (messageId: string) => {
    if (!confirm("この未マッチメッセージを非表示にしますか？")) {
      return;
    }

    setLoading(true);
    setDeleteResult(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/hide-unmatched-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminApiKey}`,
        },
        body: JSON.stringify({ messageId }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(`✅ 非表示にしました: ${data.hidden.count}件`);
        // 検索結果から除外
        if (searchResult) {
          setSearchResult({
            ...searchResult,
            unmatchedMessages: searchResult.unmatchedMessages.filter(
              (msg) => msg.id !== messageId
            ),
            count: searchResult.count - 1,
          });
        }
      } else {
        setMessage(`❌ エラー: ${data.error}\n${data.details || ""}`);
      }
    } catch (error) {
      setMessage(`❌ エラー: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">未マッチメッセージ削除</h1>

        {/* 検索セクション */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            1. 未マッチメッセージを検索
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="削除したいメッセージの内容（部分一致、空欄で全件表示）"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? "検索中..." : "検索"}
            </button>
          </div>

          {message && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              {message}
            </div>
          )}

          {/* 検索結果 */}
          {searchResult && searchResult.count > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">
                検索結果: {searchResult.count}件（未マッチメッセージのみ）
              </h3>
              <div className="space-y-4">
                {searchResult.unmatchedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="mb-2">
                      <span className="font-semibold">メッセージ:</span>{" "}
                      {msg.message}
                    </div>
                    <div className="mb-2 text-sm text-gray-600">
                      <div>
                        送信者: {msg.sender.name} ({msg.sender.email})
                      </div>
                      <div>
                        受信者: {msg.receiver.name} ({msg.receiver.email})
                      </div>
                      <div>
                        送信時刻:{" "}
                        {new Date(msg.createdAt).toLocaleString("ja-JP")}
                      </div>
                      {msg.linkTitle && (
                        <div className="mt-1 text-xs text-gray-500">
                          リンク: {msg.linkTitle}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handleHide(msg.id)}
                        disabled={loading}
                        className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:bg-gray-400"
                      >
                        {loading ? "処理中..." : "非表示にする"}
                      </button>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        disabled={loading}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400"
                      >
                        {loading ? "削除中..." : "削除する"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 削除結果 */}
        {deleteResult && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">削除結果</h2>
            <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded">
              {deleteResult}
            </pre>
          </div>
        )}

        {/* 使い方説明 */}
        <div className="bg-blue-50 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">使い方</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              検索ボックスに削除したいメッセージの内容（一部でも可）を入力
            </li>
            <li>空欄のまま検索すると、全件表示されます</li>
            <li>「検索」ボタンをクリック</li>
            <li>
              検索結果から削除したい未マッチメッセージを見つける（マッチ済みのメッセージは表示されません）
            </li>
            <li>「このメッセージを削除」ボタンをクリック</li>
            <li>確認ダイアログで「OK」を選択</li>
          </ol>
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <strong>⚠️ 注意:</strong>{" "}
            削除は取り消せません。削除前に必ず確認してください。
            <br />
            <strong>ℹ️ 補足:</strong>{" "}
            このページでは未マッチメッセージ（まだマッチしていないメッセージ）のみが表示されます。
            マッチ済みのメッセージを削除したい場合は、別の管理画面を使用してください。
          </div>
        </div>
      </div>
    </div>
  );
}
