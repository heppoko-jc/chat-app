// app/lib/translations.ts
// サーバーサイド用の翻訳ユーティリティ

type Language = "ja" | "en";

const translations: Record<Language, Record<string, string>> = {
  ja: {
    "notification.newMessage": "新規メッセージ",
    "notification.anonymousMessageFollowing": "あなた宛にメッセージが届きました（たった今）（この通知はリアルです）",
    "notification.anonymousMessageNotFollowing": "あなた宛にメッセージが届きました（たった今）（この通知はリアルです）",
    "notification.newChatMessage": "{name}さんから新着メッセージ",
    "notification.digestNewMessage": "新着メッセージ",
    "notification.digestUnmatchedSingle": "あなたに誰かからメッセージが来ています（24時間以内）",
    "notification.digestUnmatchedMultiple": "あなたに誰かから複数のメッセージが来ています（24時間以内）",
    "notification.digestFeedNew": "今日はこれまでに{n}件の新しいメッセージが追加されました",
    "notification.digestUserNew": "今日あなたに新しいメッセージが{n}件届きました",
    "notification.digestGlobalTitle": "きょうのことば",
    "notification.digestGlobalBody": "今日はこれまでに{n}件の新しいことばが追加されました",
  },
  en: {
    "notification.newMessage": "New Message",
    "notification.anonymousMessageFollowing": "You've just received a message specifically for you.\n\nThis notification is real.",
    "notification.anonymousMessageNotFollowing": "You've just received a message specifically for you.\n\nThis notification is real.",
    "notification.newChatMessage": "New message from {name}",
    "notification.digestNewMessage": "New Messages",
    "notification.digestUnmatchedSingle": "You have a message from someone (within 24 hours)",
    "notification.digestUnmatchedMultiple": "You have multiple messages from someone (within 24 hours)",
    "notification.digestFeedNew": "{n} new messages have been added today",
    "notification.digestUserNew": "You received {n} new messages today",
    "notification.digestGlobalTitle": "Today's Words",
    "notification.digestGlobalBody": "{n} new words have been added today",
  },
};

/**
 * サーバーサイドで使用する翻訳関数
 * @param language 言語 ("ja" | "en")
 * @param key 翻訳キー
 * @param params パラメータ（オプション）
 * @returns 翻訳された文字列
 */
export function translate(
  language: Language,
  key: string,
  params?: Record<string, string | number>
): string {
  const lang = language === "ja" || language === "en" ? language : "ja";
  const translation = translations[lang][key] || key;
  
  if (!params) return translation;
  
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    translation
  );
}

