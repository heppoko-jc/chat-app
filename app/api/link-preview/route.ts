// app/api/link-preview/route.ts

import { NextRequest, NextResponse } from "next/server";

function absoluteUrl(
  base: string,
  maybeRelative?: string | null
): string | undefined {
  try {
    if (!maybeRelative) return undefined;
    // new URL handles absolute; for relative, resolve against base
    const u = new URL(maybeRelative, base);
    return u.toString();
  } catch {
    return undefined;
  }
}

function extractMeta(html: string, url: string) {
  const pick = (re: RegExp): string | undefined => {
    const m = html.match(re);
    return m?.[1]?.trim() || undefined;
  };
  const ogTitle =
    pick(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ) ||
    pick(/<meta[^>]+name=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const twitterTitle = pick(
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  const metaTitle = pick(
    /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  const itempropName = pick(
    /<meta[^>]+itemprop=["']name["'][^>]+content=["']([^"']+)["'][^>]*>/i
  );
  const h1Text = pick(/<h1[^>]*>([^<]+)<\/h1>/i);
  const titleTag = pick(/<title[^>]*>([^<]+)<\/title>/i);

  const ogImage =
    pick(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ) ||
    pick(
      /<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ) ||
    pick(
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["'][^>]*>/i
    );
  const twitterImage =
    pick(
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ) ||
    pick(
      /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ) ||
    pick(
      /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["'][^>]*>/i
    ) ||
    pick(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i);

  const title =
    ogTitle ||
    twitterTitle ||
    metaTitle ||
    itempropName ||
    h1Text ||
    titleTag ||
    url;
  const imageRaw = ogImage || twitterImage;
  const image = absoluteUrl(url, imageRaw);

  return { title, image };
}

// Google Maps URLから地名を抽出する関数
function extractLocationFromGoogleMapsUrl(url: URL): string | null {
  try {
    console.log("[link-preview] Extracting location from URL:", url.toString());

    // パスから地名を抽出
    const pathParts = url.pathname.split("/").filter((part) => part.length > 0);

    // /maps/place/地名 の形式の場合
    if (pathParts.includes("place") && pathParts.length > 2) {
      const placeIndex = pathParts.indexOf("place");
      if (placeIndex + 1 < pathParts.length) {
        const location = pathParts[placeIndex + 1];
        const decodedLocation = decodeURIComponent(
          location.replace(/\+/g, " ")
        );
        console.log(
          "[link-preview] Extracted location from path:",
          decodedLocation
        );

        // 場所の名前のみを抽出する関数
        const extractPlaceName = (fullAddress: string): string => {
          // 郵便番号を除去（例：〒100-0001 や 100-0001）
          let cleaned = fullAddress.replace(/〒?\d{3}-?\d{4}\s*/, '');
          
          // 都道府県を除去
          cleaned = cleaned.replace(/^(東京都|大阪府|京都府|北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)\s*/, '');
          
          // 市区町村を除去（一般的なパターン）
          cleaned = cleaned.replace(/^[^市区町村]+(市|区|町|村)\s*/, '');
          
          // 住所の数字部分を除去（例：1-1-1, 2-2-1など）
          cleaned = cleaned.replace(/^\d+-\d+-\d+\s*/, '');
          cleaned = cleaned.replace(/^\d+-\d+\s*/, '');
          cleaned = cleaned.replace(/^\d+\s*/, '');
          
          // さらに詳細な住所パターンを除去
          // 例：千代田1-1-1 → 千代田
          cleaned = cleaned.replace(/^([^0-9]+)\d+-\d+-\d+\s*/, '$1');
          cleaned = cleaned.replace(/^([^0-9]+)\d+-\d+\s*/, '$1');
          cleaned = cleaned.replace(/^([^0-9]+)\d+\s*/, '$1');
          
          // 最後の手段：カンマや句読点で分割して最後の部分（店舗名）を取得
          const parts = cleaned.split(/[,，、]/);
          const placeName = parts[parts.length - 1].trim();
          
          // 空の場合は元の文字列を返す
          return placeName || fullAddress;
        };

        const placeName = extractPlaceName(decodedLocation);
        console.log("[link-preview] Extracted place name:", placeName);
        return placeName;
      }
    }

    // クエリパラメータから地名を抽出
    const q = url.searchParams.get("q");
    if (q) {
      const decodedQ = decodeURIComponent(q);
      console.log("[link-preview] Extracted location from query:", decodedQ);

      // 場所の名前のみを抽出
      const extractPlaceName = (fullAddress: string): string => {
        // 郵便番号を除去
        let cleaned = fullAddress.replace(/〒?\d{3}-?\d{4}\s*/, '');
        
        // 都道府県を除去
        cleaned = cleaned.replace(/^(東京都|大阪府|京都府|北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)\s*/, '');
        
        // 市区町村を除去
        cleaned = cleaned.replace(/^[^市区町村]+(市|区|町|村)\s*/, '');
        
        // 住所の数字部分を除去（例：1-1-1, 2-2-1など）
        cleaned = cleaned.replace(/^\d+-\d+-\d+\s*/, '');
        cleaned = cleaned.replace(/^\d+-\d+\s*/, '');
        cleaned = cleaned.replace(/^\d+\s*/, '');
        
        // さらに詳細な住所パターンを除去
        // 例：千代田1-1-1 → 千代田
        cleaned = cleaned.replace(/^([^0-9]+)\d+-\d+-\d+\s*/, '$1');
        cleaned = cleaned.replace(/^([^0-9]+)\d+-\d+\s*/, '$1');
        cleaned = cleaned.replace(/^([^0-9]+)\d+\s*/, '$1');
        
          // 最後の手段：カンマや句読点で分割して最後の部分（店舗名）を取得
          const parts = cleaned.split(/[,，、]/);
          const placeName = parts[parts.length - 1].trim();
          
          return placeName || fullAddress;
      };

      const placeName = extractPlaceName(decodedQ);
      console.log("[link-preview] Extracted place name from query:", placeName);
      return placeName;
    }

    // @lat,lng,zoom の形式の場合
    const atParam = url.searchParams.get("@");
    if (atParam) {
      // この場合は座標なので、別の方法で地名を取得する必要がある
      return null;
    }

    console.log("[link-preview] No location found in URL");
    return null;
  } catch (e) {
    console.log("[link-preview] Error extracting location:", e);
    return null;
  }
}

// 短縮URLを解決する関数
async function resolveShortUrl(shortUrl: string): Promise<string | null> {
  try {
    const response = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "manual",
    });

    const location = response.headers.get("location");
    return location;
  } catch (e) {
    console.log("[link-preview] Error resolving short URL:", e);
    return null;
  }
}

// 地名に基づいて画像を取得する関数
async function getLocationImage(
  locationTitle: string | null
): Promise<string | undefined> {
  if (!locationTitle) {
    console.log("[link-preview] No location title provided");
    return undefined;
  }

  console.log("[link-preview] Getting image for location:", locationTitle);

  try {
    // APIキーがない場合は、画像なし（アイコン表示）
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      console.log(
        "[link-preview] No Google Maps API key, no image will be shown"
      );
      return undefined; // 画像なしで、フロントエンドで🗺️アイコンを表示
    }

    // Google Static Maps APIを使用して地図の画像を取得
    const staticMapsUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
      locationTitle
    )}&zoom=13&size=400x300&maptype=roadmap&markers=color:red%7C${encodeURIComponent(
      locationTitle
    )}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

    console.log("[link-preview] Generated Google Maps URL:", staticMapsUrl);
    return staticMapsUrl;
  } catch (e) {
    console.log("[link-preview] Error fetching location image:", e);
  }

  return undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const target = searchParams.get("url");
    if (!target)
      return NextResponse.json({ error: "url is required" }, { status: 400 });

    // Basic validation
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }

    // Google Maps の特別処理
    if (
      url.hostname.includes("google.com") &&
      url.pathname.includes("/maps/")
    ) {
      console.log(
        "[link-preview] Google Maps detected, extracting location info"
      );
      console.log("[link-preview] Google Maps URL:", url.toString());

      // URLから地名を抽出
      const locationTitle = extractLocationFromGoogleMapsUrl(url);
      console.log("[link-preview] Extracted location title:", locationTitle);

      // 地名に基づいて画像を取得
      const locationImage = await getLocationImage(locationTitle);
      console.log("[link-preview] Generated location image:", locationImage);

      const result = {
        url: url.toString(),
        title: locationTitle || "Google Maps",
        image: locationImage,
      };
      console.log("[link-preview] Google Maps result:", result);

      return NextResponse.json(result);
    }

    // Google Maps の短縮URLの特別処理
    if (
      url.hostname.includes("maps.app.goo.gl") ||
      url.hostname.includes("goo.gl")
    ) {
      console.log(
        "[link-preview] Google Maps short URL detected, resolving and extracting location"
      );

      // 短縮URLを解決してから地名を抽出
      try {
        const resolvedUrl = await resolveShortUrl(url.toString());
        if (resolvedUrl) {
          const resolvedUrlObj = new URL(resolvedUrl);
          const locationTitle =
            extractLocationFromGoogleMapsUrl(resolvedUrlObj);
          const locationImage = await getLocationImage(locationTitle);

          return NextResponse.json({
            url: url.toString(),
            title: locationTitle || "Google Maps",
            image: locationImage,
          });
        }
      } catch (e) {
        console.log("[link-preview] Failed to resolve short URL:", e);
      }

      return NextResponse.json({
        url: url.toString(),
        title: "Google Maps",
        image: undefined,
      });
    }

    console.log("[link-preview] fetching:", url.toString());
    // Timeout + realistic browser headers
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ja,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    console.log(
      "[link-preview] response status:",
      res.status,
      "content-type:",
      res.headers.get("content-type")
    );
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      console.log(
        "[link-preview] fetch failed, returning fallback:",
        res.status
      );
      // 404やアクセスエラーの場合は、URLの最後の部分をタイトルとして使用
      const pathParts = url.pathname
        .split("/")
        .filter((part) => part.length > 0);
      const lastPart = pathParts[pathParts.length - 1];
      const title = lastPart ? decodeURIComponent(lastPart) : url.hostname;

      return NextResponse.json({
        url: url.toString(),
        title: title,
        image: undefined, // 画像は表示しない
      });
    }
    if (!contentType.includes("text/html")) {
      console.log("[link-preview] non-html content, returning fallback");
      // 非HTMLコンテンツの場合も、URLの最後の部分をタイトルとして使用
      const pathParts = url.pathname
        .split("/")
        .filter((part) => part.length > 0);
      const lastPart = pathParts[pathParts.length - 1];
      const title = lastPart ? decodeURIComponent(lastPart) : url.hostname;

      return NextResponse.json({
        url: url.toString(),
        title: title,
        image: undefined, // 画像は表示しない
      });
    }
    const html = await res.text();
    console.log("[link-preview] html length:", html.length);
    const meta = extractMeta(html, url.toString());
    console.log("[link-preview] extracted meta:", {
      title: meta.title,
      hasImage: !!meta.image,
    });
    // 画像が無い場合は画像なし（エラーを避けるため）
    const image = meta.image || undefined;
    const result = { url: url.toString(), title: meta.title, image };
    console.log("[link-preview] final result:", result);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[link-preview] error:", e);
    // エラーでもフォールバック情報を返す
    const target = new URL(req.url).searchParams.get("url");
    if (target) {
      try {
        const url = new URL(target);
        // エラー時も、URLの最後の部分をタイトルとして使用
        const pathParts = url.pathname
          .split("/")
          .filter((part) => part.length > 0);
        const lastPart = pathParts[pathParts.length - 1];
        const title = lastPart ? decodeURIComponent(lastPart) : url.hostname;

        return NextResponse.json({
          url: url.toString(),
          title: title,
          image: undefined, // 画像は表示しない
        });
      } catch {
        return NextResponse.json({ error: "internal error" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
