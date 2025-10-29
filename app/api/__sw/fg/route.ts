// app/api/__sw/fg/route.ts
// SWVisibilityPinger の sendBeacon("/__sw/fg") を受け止めるダミーエンドポイント

export async function POST() {
  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response(null, { status: 204 });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
