// app/lib/link-utils.ts

// URLとテキストを分離する関数
export function extractUrlAndText(
  input: string
): { url: string; text: string | null } | null {
  console.log("🔍 extractUrlAndText input:", input);
  // 全角スペースを半角スペースに変換
  const normalizedInput = input.replace(/　/g, " ");

  // スペースありの場合をチェック
  const spaceMatch = normalizedInput.match(/^(https?:\/\/[^\s]+)\s+(.+)$/i);
  if (spaceMatch) {
    const result = {
      url: spaceMatch[1],
      text: spaceMatch[2],
    };
    console.log("🔍 extractUrlAndText spaceMatch result:", result);
    return result;
  }

  // スペースなしの場合をチェック（URLの後に直接テキストが続く場合）
  const directMatch = normalizedInput.match(
    /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%].+)$/
  );
  if (directMatch && directMatch[2]) {
    return {
      url: directMatch[1],
      text: directMatch[2],
    };
  }

  // URLのみの場合
  const urlOnlyMatch = normalizedInput.match(
    /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)$/
  );
  if (urlOnlyMatch) {
    const result = {
      url: urlOnlyMatch[1],
      text: null,
    };
    console.log("🔍 extractUrlAndText urlOnlyMatch result:", result);
    return result;
  }

  console.log("🔍 extractUrlAndText no match found");
  return null;
}

// リンクメタデータを取得する関数
export async function fetchLinkMetadata(url: string): Promise<{
  url: string;
  title: string;
  image?: string;
} | null> {
  try {
    const cacheBuster = Date.now() + Math.random();
    const response = await fetch(
      `/api/link-preview?url=${encodeURIComponent(url)}&t=${cacheBuster}`
    );

    if (!response.ok) {
      return {
        url,
        title: url,
        image: undefined,
      };
    }

    const data = await response.json();
    return {
      url: data.url || url,
      title: data.title || url,
      image: data.image,
    };
  } catch (error) {
    console.error("Error fetching link metadata:", error);
    return {
      url,
      title: url,
      image: undefined,
    };
  }
}

// メッセージがリンクを含むかどうかを判定する関数
export function isLinkMessage(message: string): boolean {
  const result =
    message.startsWith("http://") || message.startsWith("https://");
  console.log("🔍 isLinkMessage:", { message, result });
  return result;
}
