// app/layout.tsx

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PushRegistrar from "./components/PushRegistrar";
import Providers from "./providers";
import RegisterSW from "./register-sw"; // SW登録（client）
import SWVisibilityPinger from "./components/SWVisibilityPinger"; // ← 追加（client）

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Happy Ice Cream",
  description: "matching chat App",
  icons: {
    icon: "/icons/icon-192x192.png",
    shortcut: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512x512.png" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="color-scheme" content="light" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* 先にSWを登録（ready に到達してから pinger が動きます） */}
        <RegisterSW />

        {/* 画面状態をSWへ常時送信（通知抑制のためのハートビート） */}
        <SWVisibilityPinger />

        {/* アプリ本体 */}
        <Providers>
          {children}
          <PushRegistrar />
        </Providers>
      </body>
    </html>
  );
}