// app/admin/consents/page.tsx
"use client";

import { useState, useEffect } from "react";
import axios from "axios";

interface ConsentUser {
  id: string;
  email: string;
  name: string;
  participantName: string | null;
  consentDate: string | null;
  consentParticipated: boolean | null;
  consentInterview: boolean | null;
  consentDataUsage: boolean | null;
  consentRecording: boolean | null;
  createdAt: string;
}

export default function ConsentsPage() {
  const [consents, setConsents] = useState<ConsentUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConsents = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setError("ログインが必要です");
          return;
        }

        const response = await axios.get<{ consents: ConsentUser[] }>(
          "/api/auth/consent",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setConsents(response.data.consents);
      } catch (err) {
        console.error("同意情報の取得エラー:", err);
        setError("同意情報の取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    };

    fetchConsents();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">同意情報一覧</h1>
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">同意情報一覧</h1>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-2">同意情報一覧</h1>
        <p className="text-gray-600">
          総数: {consents.length}名
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-4 py-2">順番</th>
              <th className="border px-4 py-2">参加者名</th>
              <th className="border px-4 py-2">登録名</th>
              <th className="border px-4 py-2">メール</th>
              <th className="border px-4 py-2">同意日時</th>
              <th className="border px-4 py-2">参加</th>
              <th className="border px-4 py-2">インタビュー</th>
              <th className="border px-4 py-2">データ使用</th>
              <th className="border px-4 py-2">録音</th>
              <th className="border px-4 py-2">登録日時</th>
            </tr>
          </thead>
          <tbody>
            {consents.map((consent, index) => (
              <tr key={consent.id}>
                <td className="border px-4 py-2">{index + 1}</td>
                <td className="border px-4 py-2">
                  {consent.participantName || "-"}
                </td>
                <td className="border px-4 py-2">{consent.name}</td>
                <td className="border px-4 py-2">{consent.email}</td>
                <td className="border px-4 py-2">
                  {consent.consentDate
                    ? new Date(consent.consentDate).toLocaleString("ja-JP")
                    : "-"}
                </td>
                <td className="border px-4 py-2 text-center">
                  {consent.consentParticipated ? "○" : "-"}
                </td>
                <td className="border px-4 py-2 text-center">
                  {consent.consentInterview ? "○" : "-"}
                </td>
                <td className="border px-4 py-2 text-center">
                  {consent.consentDataUsage ? "○" : "-"}
                </td>
                <td className="border px-4 py-2 text-center">
                  {consent.consentRecording === true
                    ? "許可"
                    : consent.consentRecording === false
                    ? "拒否"
                    : "-"}
                </td>
                <td className="border px-4 py-2">
                  {new Date(consent.createdAt).toLocaleString("ja-JP")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          更新
        </button>
      </div>
    </div>
  );
}
