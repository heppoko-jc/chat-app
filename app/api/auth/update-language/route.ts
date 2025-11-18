import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const userId = verifyJwt(token);

    const { language } = await req.json();
    if (language !== "ja" && language !== "en") {
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { language },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Language update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

