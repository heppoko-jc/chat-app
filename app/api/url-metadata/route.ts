// app/api/url-metadata/route.ts - URLメタデータ取得API

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // URLの検証
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // メタデータを取得
    const metadata = await fetchUrlMetadata(url);

    if (!metadata) {
      return NextResponse.json(
        { error: "Failed to fetch metadata" },
        { status: 500 }
      );
    }

    return NextResponse.json(metadata);
  } catch (error) {
    console.error("URL metadata API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// 画像URLを正規化する関数
function normalizeImageUrl(imageUrl: string, baseUrl: string): string {
  if (!imageUrl) return "";

  // プロトコル相対URL（//で始まる）の場合
  if (imageUrl.startsWith("//")) {
    return `https:${imageUrl}`;
  }

  // 相対URLの場合
  if (imageUrl.startsWith("/")) {
    const baseUrlObj = new URL(baseUrl);
    return `${baseUrlObj.protocol}//${baseUrlObj.host}${imageUrl}`;
  }

  // 既に絶対URLの場合
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  // その他の場合はベースURLと結合
  try {
    return new URL(imageUrl, baseUrl).toString();
  } catch {
    return imageUrl;
  }
}

// URLからメタデータを取得する関数
async function fetchUrlMetadata(url: string) {
  try {
    // 実際の実装では、cheerioやpuppeteerなどを使ってHTMLを解析します
    // ここでは簡易的な実装として、ドメイン名とタイトルを返します
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");

    // 実際のHTMLを取得してメタデータを抽出
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChatApp/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // 簡易的なメタデータ抽出
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const descriptionMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
    );
    const imageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i
    );

    // 画像URLを正規化
    const rawImageUrl = imageMatch ? imageMatch[1].trim() : "";
    const normalizedImageUrl = normalizeImageUrl(rawImageUrl, url);

    return {
      title: titleMatch ? titleMatch[1].trim() : domain,
      description: descriptionMatch ? descriptionMatch[1].trim() : "",
      image: normalizedImageUrl,
      url,
      domain,
    };
  } catch (error) {
    console.error("Error fetching URL metadata:", error);
    // フォールバックとしてドメイン名のみを返す
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");

    return {
      title: domain,
      description: "",
      image: "",
      url,
      domain,
    };
  }
}
