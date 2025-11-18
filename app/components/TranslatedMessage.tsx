// app/components/TranslatedMessage.tsx
// 翻訳されたメッセージを表示するコンポーネント

import { useTranslateMessage } from "../../hook/useTranslateMessage";

interface TranslatedMessageProps {
  text: string;
  sourceLang?: string;
  className?: string;
}

/**
 * メッセージを翻訳して表示するコンポーネント
 * @param text 元のテキスト
 * @param sourceLang 元の言語（デフォルト: "ja"）
 * @param className 追加のCSSクラス
 */
export default function TranslatedMessage({
  text,
  sourceLang = "ja",
  className = "",
}: TranslatedMessageProps) {
  const { translatedText, isLoading } = useTranslateMessage(text, sourceLang);

  // 翻訳中は元のテキストを表示（またはローディング表示）
  const displayText = translatedText ?? text;

  return (
    <span className={className}>
      {displayText}
      {isLoading && (
        <span className="opacity-50 text-xs ml-1">(翻訳中...)</span>
      )}
    </span>
  );
}

