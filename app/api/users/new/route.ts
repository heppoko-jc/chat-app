import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 新規参加者取得
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");

  if (!since) {
    return NextResponse.json(
      { error: "since parameter required" },
      { status: 400 }
    );
  }

  try {
    const newUsers = await prisma.user.findMany({
      where: {
        createdAt: {
          gt: new Date(since),
        },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json(newUsers);
  } catch (error) {
    console.error("新規参加者取得エラー:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
