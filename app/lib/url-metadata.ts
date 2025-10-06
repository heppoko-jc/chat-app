// app/lib/url-metadata.ts - URLメタデータ取得ユーティリティ

export interface UrlMetadata {
  title: string;
  description?: string;
  image?: string;
  url: string;
  domain: string;
}

// URL検出の正規表現
export const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

// URLが有効かどうかをチェック
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return URL_REGEX.test(url);
  } catch {
    return false;
  }
}

// ドメイン名を抽出
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

// URLからメタデータを取得（CORS制限のため、プロキシ経由で取得）
export async function fetchUrlMetadata(
  url: string
): Promise<UrlMetadata | null> {
  try {
    // 実際の実装では、CORS制限を回避するためにプロキシサーバーを使用する必要があります
    // ここでは簡易的な実装として、ドメイン名のみを返します
    const domain = extractDomain(url);

    return {
      title: domain,
      description: "",
      image: "",
      url,
      domain,
    };
  } catch (error) {
    console.error("URL metadata fetch error:", error);
    return null;
  }
}

// より高度なメタデータ取得（プロキシサーバー使用）
export async function fetchUrlMetadataWithProxy(
  url: string
): Promise<UrlMetadata | null> {
  try {
    // プロキシサーバー経由でメタデータを取得
    const proxyUrl = `/api/url-metadata?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch metadata");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("URL metadata fetch error:", error);
    return null;
  }
}
