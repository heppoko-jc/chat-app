import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 403 }
    );
  }

  try {
    const sessions = await prisma.userSession.findMany({
      orderBy: { startTime: "desc" },
      take: 100,
    });
    return NextResponse.json({ sessions });
  } catch (e) {
    console.error("[dev/sessions]", e);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
