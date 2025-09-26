// next.config.ts

import withPWA from "next-pwa";
import type { NextConfig } from "next";

const pwaOptions = {
  dest: "public",
  register: true,
  skipWaiting: true,

  // ★ 開発では無効 / 本番のみ有効
  disable: process.env.NODE_ENV !== "production",

  // ★ InjectManifest モード（手書きの service-worker.js を使う）
  swSrc: "service-worker.js",

  buildExcludes: [
    /app-build-manifest\.json$/,
    /middleware-build-manifest\.json$/,
    /\.js\.map$/,
  ],

  fallbacks: {
    document: "/offline.html",
  },
};

const withPWAMiddleware = withPWA(pwaOptions);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default withPWAMiddleware(nextConfig);
