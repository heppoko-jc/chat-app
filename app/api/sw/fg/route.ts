// app/api/sw/fg/route.ts
// SWVisibilityPinger の sendBeacon("/api/sw/fg") を受け止めるダミーエンドポイント

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // 開発環境ではService Workerが無効なので、このエンドポイントはダミーとして動作
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  return new NextResponse(null, { status: 204 });
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204 });
}
