// app/api/translate/route.ts
// 翻訳APIエンドポイント

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  translateText,
  prepareTextForTranslation,
  combineTranslatedTextAndUrl,
} from "@/lib/translate-api";

export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang = "ja", targetLang = "en" } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    // 同じ言語の場合は翻訳不要
    if (sourceLang === targetLang) {
      return NextResponse.json({ translatedText: text });
    }

    // URLを抽出して、テキスト部分のみを翻訳対象にする
    const { text: textToTranslate, url } =
      prepareTextForTranslation(text);

    // テキスト部分が空の場合はURLのみを返す
    if (!textToTranslate || textToTranslate.trim() === "") {
      return NextResponse.json({ translatedText: url || text });
    }

    // キャッシュを確認
    const cacheKey = {
      sourceText: textToTranslate,
      sourceLang,
      targetLang,
    };

    const cached = await prisma.translationCache.findUnique({
      where: {
        sourceText_sourceLang_targetLang: cacheKey,
      },
    });

    if (cached) {
      // キャッシュが見つかった場合、URLと結合して返す
      const result = combineTranslatedTextAndUrl(cached.translatedText, url);
      return NextResponse.json({ translatedText: result });
    }

    // キャッシュがない場合、翻訳APIを呼び出す
    let translatedText: string;
    try {
      translatedText = await translateText(
        textToTranslate,
        sourceLang,
        targetLang
      );
    } catch (error) {
      console.error("Translation API error:", error);
      // エラー時は元のテキストを返す（エラーレスポンスではなく、正常レスポンスで元のテキストを返す）
      const result = combineTranslatedTextAndUrl(textToTranslate, url);
      return NextResponse.json({ translatedText: result });
    }

    // キャッシュに保存（エラーが発生しても処理は継続）
    try {
      await prisma.translationCache.upsert({
        where: {
          sourceText_sourceLang_targetLang: cacheKey,
        },
        create: {
          sourceText: textToTranslate,
          sourceLang,
          targetLang,
          translatedText,
        },
        update: {
          translatedText,
          updatedAt: new Date(),
        },
      });
    } catch (cacheError) {
      console.error("Cache save error:", cacheError);
      // キャッシュ保存エラーは無視して続行
    }

    // URLと結合して返す
    const result = combineTranslatedTextAndUrl(translatedText, url);
    return NextResponse.json({ translatedText: result });
  } catch (error) {
    console.error("Translate API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

