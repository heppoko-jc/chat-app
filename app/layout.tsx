import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PushRegistrar from "./components/PushRegistrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Glance",
  description: "matching chat App",
  // これだけでも <meta name="theme-color"> は自動で出ます
  icons: {
    icon: "/icons/icon-192x192.png",
    shortcut: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({

}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Next.js の app-router では <head> を直接書けます */}
      <head>
        {/* PWA マニフェスト */}
        <link rel="manifest" href="/manifest.json" />

        {/* Safari 用ホーム画面アイコン */}
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/icons/apple-touch-icon.png"
        />

        {/* Android Chrome 用アイコン */}
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icons/icon-192x192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/icons/icon-512x512.png"
        />

        {/* SMIL タイルカラー */}
        <meta name="theme-color" content="#ffffff" />

        <meta name="color-scheme" content="light" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >

        <PushRegistrar /> {/* ← ここでクライアント専用処理を走らせる */}
      </body>
    </html>
  );
}
