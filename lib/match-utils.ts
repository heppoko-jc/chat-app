// lib/match-utils.ts
// マッチ期限に関する共通ユーティリティ関数

export const MATCH_EXPIRY_HOURS = 24; // 旧: マッチの期限（時間）※スクリプト等で参照される可能性あり）
export const MATCH_EXPIRY_MS = MATCH_EXPIRY_HOURS * 60 * 60 * 1000; // ミリ秒

/** 送信時に選べる有効期間（日数） */
export const EXPIRY_DAYS_OPTIONS = [1, 7, 14] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS_OPTIONS)[number];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 現在時刻から指定日数後の有効期限日時を返す（SentMessage.expiresAt 用）
 */
export function getExpiresAtForDays(days: number): Date {
  return new Date(Date.now() + days * MS_PER_DAY);
}

/**
 * 有効期間の値が 1 | 7 | 14 かどうか
 */
export function isValidExpiryDays(days: unknown): days is ExpiryDays {
  return typeof days === "number" && EXPIRY_DAYS_OPTIONS.includes(days as ExpiryDays);
}

/**
 * マッチの期限切れ判定用の日時を取得
 * @returns 期限切れの境界となる日時
 */
export function getMatchExpiryDate(): Date {
  return new Date(Date.now() - MATCH_EXPIRY_MS);
}

/**
 * 指定された日時が期限切れかどうかを判定
 * @param date 判定対象の日時
 * @returns 期限切れの場合true
 */
export function isMatchExpired(date: Date): boolean {
  return date < getMatchExpiryDate();
}

/**
 * 期限切れでないメッセージのみをフィルタリング
 * @param messages メッセージ配列
 * @param getDateFn 日時を取得する関数
 * @returns 有効なメッセージのみ
 */
export function filterValidMessages<T>(
  messages: T[],
  getDateFn: (message: T) => Date
): T[] {
  const expiryDate = getMatchExpiryDate();
  return messages.filter((message) => getDateFn(message) >= expiryDate);
}

/**
 * 期限切れの表示用テキストを取得
 * @returns 期限切れの表示テキスト
 */
export function getExpiredText(): string {
  return `${MATCH_EXPIRY_HOURS}時間期限切れ`;
}

/**
 * マッチ期限の説明文を取得
 * @returns 期限の説明文
 */
export function getMatchExpiryDescription(): string {
  return `${MATCH_EXPIRY_HOURS}時間以内にマッチできるかな？`;
}
