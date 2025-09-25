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
      return NextResponse.json({
        url: url.toString(),
        title: url.toString(),
        image: `${url.origin}/favicon.ico`,
      });
    }
    if (!contentType.includes("text/html")) {
      console.log("[link-preview] non-html content, returning fallback");
      return NextResponse.json({
        url: url.toString(),
        title: url.toString(),
        image: `${url.origin}/favicon.ico`,
      });
    }
    const html = await res.text();
    console.log("[link-preview] html length:", html.length);
    const meta = extractMeta(html, url.toString());
    console.log("[link-preview] extracted meta:", {
      title: meta.title,
      hasImage: !!meta.image,
    });
    // 画像が無い場合は favicon を最後の手段として提示
    const origin = new URL(url.toString()).origin;
    const image = meta.image || `${origin}/favicon.ico`;
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
        return NextResponse.json({
          url: url.toString(),
          title: url.toString(),
          image: `${url.origin}/favicon.ico`,
        });
      } catch {
        return NextResponse.json({ error: "internal error" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
