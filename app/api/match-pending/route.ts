import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("userId");
    if (!userId)
      return NextResponse.json({ error: "userId required" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since") || "1970-01-01T00:00:00.000Z";
    const sinceDate = new Date(since);

    // 自分が関係する matchPair から “since より後” を昇順で取得
    const pairs = await prisma.matchPair.findMany({
      where: {
        matchedAt: { gt: sinceDate }, // ← “以後” ではなく “より後”
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      orderBy: { matchedAt: "asc" },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
      },
      take: 50, // 適宜
    });

    const items = pairs.map((p) => {
      const other = p.user1.id === userId ? p.user2 : p.user1;
      return {
        matchId: p.id,
        matchedAt: p.matchedAt.toISOString(),
        message: p.message,
        matchedUser: { id: other.id, name: other.name },
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error("match-pending error:", e);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
