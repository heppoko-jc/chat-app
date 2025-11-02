import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = auth.slice(7);
    const userId = verifyJwt(token);

    const { at } = (await req.json().catch(() => ({ at: Date.now() }))) as {
      at?: number | string;
    };
    const atMs = typeof at === "number" ? at : Date.now();
    const atDate = new Date(atMs);

    // Dedupe window: 5 minutes
    const windowMs = 5 * 60 * 1000;
    const since = new Date(atDate.getTime() - windowMs);

    const exists = await prisma.userSession.findFirst({
      where: { userId, startTime: { gte: since } },
      select: { id: true },
    });

    if (!exists) {
      await prisma.userSession.create({ data: { userId, startTime: atDate } });
    }

    return NextResponse.json({ ok: true, skipped: !!exists });
  } catch (e) {
    console.error("[telemetry/open]", e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
