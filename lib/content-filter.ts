// lib/content-filter.ts
// 特定キーワードを含むメッセージを検出する

/**
 * 環境変数から非表示キーワードリストを取得
 */
export function getHiddenKeywords(): string[] {
  const keywords = process.env.HIDDEN_KEYWORDS || "";
  if (!keywords) return [];

  // カンマ区切りでキーワードを分割
  return keywords
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * メッセージに非表示キーワードが含まれているかチェック
 */
export function shouldHideMessage(message: string): boolean {
  const keywords = getHiddenKeywords();
  if (keywords.length === 0) return false;

  const normalizedMessage = message.toLowerCase();

  // いずれかのキーワードが含まれているかチェック
  return keywords.some((keyword) =>
    normalizedMessage.includes(keyword.toLowerCase())
  );
}
