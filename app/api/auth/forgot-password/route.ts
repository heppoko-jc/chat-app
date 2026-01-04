// app/api/auth/forgot-password/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { Resend } from "resend";

const prisma = new PrismaClient();

// Resendインスタンスを安全に作成（環境変数がない場合はnull）
let resendInstance: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resendInstance = new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    console.log("🔹 パスワードリセットリクエスト:", { email });

    if (!email) {
      return NextResponse.json(
        { error: "メールアドレスが必要です" },
        { status: 400 }
      );
    }

    // ユーザーを検索
    const user = await prisma.user.findUnique({ where: { email } });

    // セキュリティのため、ユーザーが存在しない場合でも同じメッセージを返す
    if (user) {
      // リセットトークンを生成
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetExpires = new Date();
      resetExpires.setHours(resetExpires.getHours() + 1); // 1時間有効

      // データベースに保存
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires,
        },
      });

      console.log("✅ パスワードリセットトークンを生成:", {
        email: user.email,
        token: resetToken.substring(0, 10) + "...",
      });

      // アプリのURLを取得（既存コードパターンに合わせる）
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

      // メール送信を試みる
      let emailSent = false;
      if (resendInstance && process.env.RESEND_API_KEY) {
        try {
          const fromEmail =
            process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

          await resendInstance.emails.send({
            from: fromEmail,
            to: user.email,
            subject: "パスワードリセットのお知らせ",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">パスワードリセット</h2>
                <p>パスワードをリセットするリクエストを受け付けました。</p>
                <p>以下のリンクをクリックして、新しいパスワードを設定してください：</p>
                <p style="margin: 20px 0;">
                  <a href="${resetUrl}" style="background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    パスワードをリセット
                  </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                  このリンクは1時間有効です。<br>
                  もしこのリクエストをしていない場合は、このメールを無視してください。
                </p>
                <p style="color: #666; font-size: 12px; margin-top: 30px;">
                  リンクがクリックできない場合は、以下のURLをブラウザにコピー＆ペーストしてください：<br>
                  ${resetUrl}
                </p>
              </div>
            `,
            text: `パスワードリセット\n\n以下のリンクをクリックして、新しいパスワードを設定してください：\n\n${resetUrl}\n\nこのリンクは1時間有効です。`,
          });

          emailSent = true;
          console.log("✅ パスワードリセットメールを送信しました:", user.email);
        } catch (emailError: any) {
          console.error("🚨 メール送信エラー:", {
            error: emailError?.message || emailError,
            email: user.email,
            resendError: emailError?.response?.data || emailError?.response,
          });
          // メール送信に失敗しても処理は続行（セキュリティのため）
        }
      }

      // 開発環境またはメール送信に失敗した場合、コンソールに出力
      if (!emailSent || process.env.NODE_ENV === "development") {
        console.log("📧 パスワードリセットリンク:", resetUrl);
        if (!emailSent) {
          console.warn(
            "⚠️ メール送信がスキップされました。RESEND_API_KEYが設定されていないか、メール送信に失敗しました。"
          );
        }
      }
    }

    // セキュリティのため、常に成功メッセージを返す
    return NextResponse.json({
      message: "パスワードリセット用のリンクを送信しました。メールをご確認ください。",
    });
  } catch (error) {
    console.error("🚨 パスワードリセットリクエストエラー:", error);
    return NextResponse.json(
      { error: "パスワードリセットリクエストに失敗しました" },
      { status: 500 }
    );
  }
}
