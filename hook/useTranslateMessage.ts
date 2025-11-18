// hook/useTranslateMessage.ts
// メッセージ翻訳用のカスタムフック

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "../app/contexts/LanguageContext";

interface UseTranslateMessageResult {
  translatedText: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * メッセージを翻訳するカスタムフック
 * @param originalText 元のテキスト
 * @param sourceLang 元の言語（デフォルト: "ja"）
 * @returns { translatedText, isLoading, error }
 */
export function useTranslateMessage(
  originalText: string | null | undefined,
  sourceLang: string = "ja"
): UseTranslateMessageResult {
  const { language: currentLanguage } = useLanguage();
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const translate = useCallback(
    async (text: string, source: string, target: string) => {
      if (!text || text.trim() === "") {
        setTranslatedText(text);
        setIsLoading(false);
        return;
      }

      if (source === target) {
        setTranslatedText(text);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            sourceLang: source,
            targetLang: target,
          }),
        });

        if (!response.ok) {
          throw new Error(`Translation failed: ${response.status}`);
        }

        const data = await response.json();
        setTranslatedText(data.translatedText || text);
      } catch (err) {
        console.error("Translation error:", err);
        setError(err instanceof Error ? err : new Error("Translation failed"));
        // エラー時は元のテキストを表示
        setTranslatedText(text);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!originalText) {
      setTranslatedText(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // 現在の言語が元の言語と同じ場合は翻訳不要
    if (currentLanguage === sourceLang) {
      setTranslatedText(originalText);
      setIsLoading(false);
      setError(null);
      return;
    }

    // 翻訳が必要な場合
    translate(originalText, sourceLang, currentLanguage);
  }, [originalText, sourceLang, currentLanguage, translate]);

  return { translatedText, isLoading, error };
}

