// app/api/push/status/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/jwt";

export async function GET(req: NextRequest) {
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
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        endpoint: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      hasActiveSubscription: subscriptions.length > 0,
      subscriptionCount: subscriptions.length,
      latestSubscription: subscriptions[0] || null,
      allSubscriptions: subscriptions,
    });
  } catch (error) {
    console.error("🚨 Push status error:", error);
    return NextResponse.json(
      { error: "Failed to get push status" },
      { status: 500 }
    );
  }
}

