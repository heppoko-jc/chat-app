import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import webpush, { PushSubscription as WebPushSubscription } from 'web-push'
import { io as ioClient } from 'socket.io-client'

const prisma = new PrismaClient()
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!

// VAPID 鍵の設定
webpush.setVapidDetails(
  'https://happy-ice-cream.vercel.app',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

// 2人間のチャットIDを必ず返す（なければ作る）
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

  // 正順で作成（重複防止）
  const [u1, u2] = a < b ? [a, b] : [b, a]
  const created = await prisma.chat.create({
    data: { user1Id: u1, user2Id: u2 },
    select: { id: true },
  })
  return created.id
}

export async function POST(req: NextRequest) {
  try {
    const { senderId, receiverIds, message } = await req.json()

    if (!senderId || !receiverIds?.length || !message) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    let matchedUserId: string | null = null
    let myLatestCreatedAt: Date | null = null

    // 1) 送信メッセージを保存しつつ、マッチを探す
    for (const receiverId of receiverIds) {
      // 自分の送信をまず保存（createdAt を取得）
      const mySend = await prisma.sentMessage.create({
        data: { senderId, receiverId, message },
        select: { id: true, createdAt: true },
      })
      myLatestCreatedAt = mySend.createdAt

      // この2人 & この message の直近マッチを取得
      const lastMatch = await prisma.matchPair.findFirst({
        where: {
          message,
          OR: [
            { user1Id: senderId, user2Id: receiverId },
            { user1Id: receiverId, user2Id: senderId },
          ],
        },
        orderBy: { matchedAt: 'desc' },
        select: { matchedAt: true },
      })
      const since = lastMatch?.matchedAt ?? new Date(0)

      // 「前回マッチ以降」に相手が自分宛に同じ message を送っているか
      const reciprocalAfterLastMatch = await prisma.sentMessage.findFirst({
        where: {
          senderId: receiverId,
          receiverId: senderId,
          message,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true },
      })

      // 相手の送信が「前回マッチ以降」に存在すればマッチ成立
      if (reciprocalAfterLastMatch) {
        matchedUserId = receiverId
        break
      }
      // なければ次の候補ユーザーへ（マッチはまだ）
    }

    // 2) マッチ成立時の処理
    if (matchedUserId) {
      // ユーザー情報
      const senderUser = await prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, name: true }
      })
      const matchedUser = await prisma.user.findUnique({
        where: { id: matchedUserId },
        select: { id: true, name: true }
      })
      if (!senderUser || !matchedUser) {
        throw new Error('User not found')
      }

      // PresetMessage の集計
      const existingPresetMessage = await prisma.presetMessage.findFirst({
        where: { content: message }
      })
      if (existingPresetMessage) {
        await prisma.presetMessage.update({
          where: { id: existingPresetMessage.id },
          data: { count: existingPresetMessage.count + 1 }
        })
      } else {
        await prisma.presetMessage.create({
          data: { content: message, createdBy: senderId, count: 1 }
        })
      }

      // 直近の二重作成を避けるため、マッチ作成前に最終確認（同一ペア & message の直近マッチが直近N秒にないか）
      // 競合対策の“保険”。必要なければ省略可。
      const duplicateGuard = await prisma.matchPair.findFirst({
        where: {
          message,
          OR: [
            { user1Id: senderId, user2Id: matchedUserId },
            { user1Id: matchedUserId, user2Id: senderId },
          ],
        },
        orderBy: { matchedAt: 'desc' },
        select: { id: true, matchedAt: true },
      })
      if (duplicateGuard && myLatestCreatedAt) {
        // もしすでに自分の送信時刻より新しいマッチが存在すれば再作成しない
        if (duplicateGuard.matchedAt >= myLatestCreatedAt) {
          // 既存を採用（以降の処理は継続）
        }
      }

      // MatchPair（履歴）
      const newMatchPair = await prisma.matchPair.create({
        data: { user1Id: senderId, user2Id: matchedUserId, message }
      })

      // 2人のチャットIDを確保（無ければ作成）
      const chatId = await ensureChatBetween(senderId, matchedUserId)

      // Web Push 通知（両者）
      const subs = await prisma.pushSubscription.findMany({
        where: {
          OR: [
            { userId: senderId, isActive: true },
            { userId: matchedUserId, isActive: true }
          ]
        }
      })
      await Promise.all(
        subs.map((s) => {
          const other = s.userId === senderId ? matchedUser : senderUser
          const payload = JSON.stringify({
            type: 'match',
            matchId: newMatchPair.id,
            title: 'マッチング成立！',
            body: `あなたは ${other.name} さんと「${message}」でマッチしました！`,
            matchedUserId: other.id,
            matchedUserName: other.name,
            chatId,
          })
          return webpush.sendNotification(
            s.subscription as unknown as WebPushSubscription,
            payload
          )
        })
      )

      // WebSocket でリアルタイム通知
      const socket = ioClient(SOCKET_URL, { transports: ['websocket'] })
      try {
        await new Promise<void>((resolve) => socket.on('connect', () => resolve()))

        const payload = {
          matchId: newMatchPair.id,
          chatId,
          message,
          matchedAt: newMatchPair.matchedAt.toISOString(),
        }

        // 送信者向け
        socket.emit('matchEstablished', {
          ...payload,
          matchedUserId: matchedUser.id,
          matchedUserName: matchedUser.name,
          targetUserId: senderId,
        })

        // 受信者向け
        socket.emit('matchEstablished', {
          ...payload,
          matchedUserId: senderUser.id,
          matchedUserName: senderUser.name,
          targetUserId: matchedUserId,
        })
      } finally {
        setTimeout(() => socket.disconnect(), 50)
      }

      return NextResponse.json({
        message: 'Match created!',
        matchedUserId: matchedUser.id,
        matchedUserName: matchedUser.name,
        chatId,
      })
    }

    // マッチ未成立
    return NextResponse.json({ message: 'Message sent, waiting for a match!' })
  } catch (error) {
    console.error('🚨 マッチングエラー:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}