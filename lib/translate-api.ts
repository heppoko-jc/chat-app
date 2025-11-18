// lib/translate-api.ts
// 翻訳APIのユーティリティ関数

import { extractUrlAndText } from "@/app/lib/link-utils";

/**
 * URLを抽出して、テキスト部分のみを翻訳対象にする
 * @param text 元のテキスト
 * @returns { text: 翻訳対象のテキスト, url: URL（存在する場合）, hasUrl: URLが含まれているか }
 */
export function prepareTextForTranslation(text: string): {
  text: string;
  url: string | null;
  hasUrl: boolean;
} {
  const urlResult = extractUrlAndText(text);
  
  if (urlResult) {
    // URLが含まれている場合、テキスト部分のみを翻訳対象にする
    return {
      text: urlResult.text || "", // URLのみの場合は空文字列
      url: urlResult.url,
      hasUrl: true,
    };
  }
  
  // URLが含まれていない場合、全体を翻訳対象にする
  return {
    text: text,
    url: null,
    hasUrl: false,
  };
}

/**
 * 翻訳結果とURLを結合する
 * @param translatedText 翻訳されたテキスト
 * @param url 元のURL（存在する場合）
 * @returns 結合されたテキスト
 */
export function combineTranslatedTextAndUrl(
  translatedText: string,
  url: string | null
): string {
  if (!url) return translatedText;
  if (!translatedText) return url;
  return `${url} ${translatedText}`;
}

/**
 * Google Cloud Translation APIを使用して翻訳
 * @param text 翻訳するテキスト
 * @param sourceLang 元の言語
 * @param targetLang 翻訳先の言語
 * @returns 翻訳されたテキスト
 */
export async function translateWithGoogleCloud(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  
  if (!apiKey) {
    console.warn("GOOGLE_TRANSLATE_API_KEY is not set. Translation skipped.");
    // APIキーが設定されていない場合は元のテキストを返す
    return text;
  }

  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: text,
      source: sourceLang,
      target: targetLang,
      format: "text",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Translate API error: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Google Translate API error: ${JSON.stringify(data.error)}`);
  }

  return data.data.translations[0].translatedText;
}

/**
 * DeepL APIを使用して翻訳
 * @param text 翻訳するテキスト
 * @param sourceLang 元の言語
 * @param targetLang 翻訳先の言語
 * @returns 翻訳されたテキスト
 */
export async function translateWithDeepL(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  const apiKey = process.env.DEEPL_API_KEY;
  
  if (!apiKey) {
    console.warn("DEEPL_API_KEY is not set. Translation skipped.");
    // APIキーが設定されていない場合は元のテキストを返す
    return text;
  }

  // DeepLの言語コードに変換
  const deeplSourceLang = sourceLang === "ja" ? "JA" : "EN";
  const deeplTargetLang = targetLang === "ja" ? "JA" : "EN";

  const url = "https://api-free.deepl.com/v2/translate";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      text: text,
      source_lang: deeplSourceLang,
      target_lang: deeplTargetLang,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  
  if (data.message) {
    throw new Error(`DeepL API error: ${data.message}`);
  }

  return data.translations[0].text;
}

/**
 * 使用可能な翻訳APIを使用して翻訳
 * @param text 翻訳するテキスト
 * @param sourceLang 元の言語
 * @param targetLang 翻訳先の言語
 * @returns 翻訳されたテキスト
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  // 同じ言語の場合は翻訳不要
  if (sourceLang === targetLang) {
    return text;
  }

  // 空文字列の場合はそのまま返す
  if (!text || text.trim() === "") {
    return text;
  }

  // 使用するAPIを決定（環境変数で指定、デフォルトはGoogle Cloud Translation）
  const translationProvider = process.env.TRANSLATION_PROVIDER || "google";

  try {
    if (translationProvider === "deepl") {
      return await translateWithDeepL(text, sourceLang, targetLang);
    } else {
      return await translateWithGoogleCloud(text, sourceLang, targetLang);
    }
  } catch (error) {
    console.error("Translation API error:", error);
    // エラー時は元のテキストを返す
    throw error;
  }
}

