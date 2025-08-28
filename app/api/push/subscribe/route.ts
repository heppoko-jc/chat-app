// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { PrismaClient } from "@prisma/client";
import { verifyJwt } from "@/lib/jwt";

const prisma = new PrismaClient();

webpush.setVapidDetails(
  "mailto:you@domain.com",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
  // 認証は try/catch の外で個別に 401 を返す
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice(7);

  let userId: string;
  try {
    userId = verifyJwt(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subscription } = await req.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { subscription, userId, isActive: true },
      create: { endpoint: subscription.endpoint, subscription, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("🚨 Push subscribe error:", error);
    return NextResponse.json({ error: "Failed to subscribe to push" }, { status: 500 });
  }
}