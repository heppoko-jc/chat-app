// app/api/__sw/fg/route.ts
// SWVisibilityPinger の sendBeacon("/__sw/fg") を受け止めるダミーエンドポイント

import type { NextRequest } from "next/server";

export async function POST(_req: NextRequest) {
  return new Response(null, { status: 204 });
}

export async function GET(_req: NextRequest) {
  return new Response(null, { status: 204 });
}

export async function OPTIONS(_req: NextRequest) {
  return new Response(null, { status: 204 });
}
