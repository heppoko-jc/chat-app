"use client";

import { useEffect } from "react";
import axios from "axios";

export default function ConsentSync() {
  useEffect(() => {
    const syncConsent = async () => {
      try {
        // 必要な条件をチェック
        const token = localStorage.getItem("token");
        const userId = localStorage.getItem("userId");
        const consentData = localStorage.getItem("experimentConsent");
        const consentSyncedAt = localStorage.getItem("consentSyncedAt");

        if (!token || !userId || !consentData) {
          return; // 条件不足なら何もしない
        }

        // 既に同期済みかチェック
        if (consentSyncedAt) {
          return; // 既に同期済み
        }

        // 同意データを解析
        let consent;
        try {
          consent = JSON.parse(consentData);
        } catch {
          return; // データが不正
        }

        // 必須項目をチェック
        if (!consent.consentGiven || !consent.participantName) {
          return; // 必須項目不足
        }

        // ユーザー情報を取得（メールアドレスが必要）
        const profileResponse = await axios.get("/api/auth/profile", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!profileResponse.data?.email) {
          return; // メールアドレスが取得できない
        }

        // 同意情報をDBに送信
        await axios.post("/api/auth/consent", {
          email: profileResponse.data.email,
          participantName: consent.participantName,
          consentDate: consent.consentDate,
          participation: consent.participation,
          interview: consent.interview,
          dataUsage: consent.dataUsage,
          recordingConsent: consent.recordingConsent,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // 同期完了フラグを設定
        localStorage.setItem("consentSyncedAt", new Date().toISOString());
        console.log("同意情報をDBに同期しました");

      } catch (error) {
        console.warn("同意情報の同期に失敗しました:", error);
        // エラーでも処理を続行（ユーザー体験を阻害しない）
      }
    };

    // ページ読み込み時とタブ復帰時に同期
    syncConsent();

    // タブ復帰時のイベントリスナー
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncConsent();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null; // UIは表示しない
}
