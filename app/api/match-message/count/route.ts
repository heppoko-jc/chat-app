// app/api/match-message/count/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/match-message/count
 * ヘッダー userId をもとに、
 * 自分が receiverId の sentMessage 件数を返す
 */
export async function GET(req: NextRequest) {
  const userId = req.headers.get("userId");
  if (!userId) {
    return NextResponse.json({ count: 0 });
  }
  try {
    const count = await prisma.sentMessage.count({
      where: { receiverId: userId },
    });
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error counting match-messages:", error);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}