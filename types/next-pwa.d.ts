// types/next-pwa.d.ts

import type { NextConfig } from "next";

declare module "next-pwa" {
  interface PWAOptions {
    dest: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
    scope?: string;
  }
  /** withPWA(options)(nextConfig) の形 */
  export default function withPWA(
    opts: PWAOptions
  ): (config: NextConfig) => NextConfig;
}