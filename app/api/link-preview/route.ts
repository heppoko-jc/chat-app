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

        // 長い住所の場合は、店舗名を抽出
        if (decodedLocation.length > 50) {
          // 店舗名のパターンを検索（例：ATELIER KOHTA、虎ノ門横丁など）
          const shopNamePatterns = [
            /([A-Z][A-Z\s]+[A-Z])/, // 大文字の店舗名（例：ATELIER KOHTA）
            /([^0-9]+店)/, // 〜店で終わる名前
            /([^0-9]+横丁)/, // 〜横丁で終わる名前
            /([^0-9]+ビル)/, // 〜ビルで終わる名前
          ];

          for (const pattern of shopNamePatterns) {
            const match = decodedLocation.match(pattern);
            if (match && match[1]) {
              const shopName = match[1].trim();
              console.log("[link-preview] Found shop name:", shopName);
              return shopName;
            }
          }

          // パターンが見つからない場合は、最初の部分を取得
          const parts = decodedLocation.split(/[,，]/);
          if (parts.length > 1) {
            const shortName = parts[0].trim();
            console.log("[link-preview] Shortened location:", shortName);
            return shortName;
          }
        }

        return decodedLocation;
      }
    }

    // クエリパラメータから地名を抽出
    const q = url.searchParams.get("q");
    if (q) {
      const decodedQ = decodeURIComponent(q);
      console.log("[link-preview] Extracted location from query:", decodedQ);

      // 長い住所の場合は短縮
      if (decodedQ.length > 50) {
        const parts = decodedQ.split(/[,，]/);
        if (parts.length > 1) {
          const shortName = parts[0].trim();
          console.log("[link-preview] Shortened query location:", shortName);
          return shortName;
        }
      }

      return decodedQ;
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
