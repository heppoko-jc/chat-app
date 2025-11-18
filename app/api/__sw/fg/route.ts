// app/api/__sw/fg/route.ts
// SWVisibilityPinger の sendBeacon("/__sw/fg") を受け止めるダミーエンドポイント

import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  // 開発環境ではService Workerが無効なので、このエンドポイントはダミーとして動作
  return new NextResponse(null, { status: 204 });
}

export async function GET(_req: NextRequest) {
  return new NextResponse(null, { status: 204 });
}

export async function OPTIONS(_req: NextRequest) {
  return new NextResponse(null, { status: 204 });
}
