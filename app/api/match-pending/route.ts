// app/api/match-pending/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 既存と同じ重複防止用ヘルパ（部屋が無ければ生成）
async function ensureChatBetween(a: string, b: string): Promise<string> {
  const found = await prisma.chat.findFirst({
    where: {
      OR: [
        { user1Id: a, user2Id: b },
        { user1Id: b, user2Id: a },
      ],
    },
    select: { id: true },
  })
  if (found) return found.id

  const [u1, u2] = a < b ? [a, b] : [b, a]
  const created = await prisma.chat.create({
    data: { user1Id: u1, user2Id: u2 },
    select: { id: true },
  })
  return created.id
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    // クエリ ?since=ISO （無ければ1970年）
    const { searchParams } = new URL(req.url)
    const sinceParam = searchParams.get('since') || '1970-01-01T00:00:00.000Z'
    const since = new Date(sinceParam)

    // 自分が関係者のマッチで、since以降の分を取得（昇順=古い→新しい）
    const pairs = await prisma.matchPair.findMany({
      where: {
        matchedAt: { gt: since },
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      orderBy: { matchedAt: 'asc' },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
      },
    })

    // 相手側を特定し、chatId も添付
    const items = await Promise.all(
      pairs.map(async (p) => {
        const partner = p.user1.id === userId ? p.user2 : p.user1
        const chatId = await ensureChatBetween(userId, partner.id)
        return {
          matchId: p.id,
          matchedAt: p.matchedAt.toISOString(),
          message: p.message,
          matchedUser: { id: partner.id, name: partner.name },
          chatId,
        }
      })
    )

    return NextResponse.json({ items })
  } catch (e) {
    console.error('🚨 match-pending error:', e)
    return NextResponse.json({ error: 'failed to fetch pending matches' }, { status: 500 })
  }
}