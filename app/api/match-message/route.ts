// app/api/match-message/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import webpush, { PushSubscription as WebPushSubscription } from 'web-push'
import { io as ioClient } from 'socket.io-client'

const prisma = new PrismaClient()
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!

// VAPID 鍵の設定
webpush.setVapidDetails(
  'https://chat-app-beta-amber-91.vercel.app',
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

    // 1) 送信メッセージを保存しつつ、マッチを探す
    for (const receiverId of receiverIds) {
      await prisma.sentMessage.create({
        data: { senderId, receiverId, message }
      })
      const existingMatch = await prisma.sentMessage.findFirst({
        where: {
          senderId: receiverId,
          receiverId: senderId,
          message
        }
      })
      if (existingMatch) {
        matchedUserId = receiverId
        break
      }
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

      // MatchPair（履歴）
      const newMatchPair = await prisma.matchPair.create({
        data: { user1Id: senderId, user2Id: matchedUserId, message }
      })

      // ★ ここが超重要：2人のチャットIDを確保しておく（無ければ作成）
      const chatId = await ensureChatBetween(senderId, matchedUserId)

      // Web Push 通知
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
            chatId, // ← 通知側でも持たせておくとSW遷移時に便利
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
        // 送信者向け（ユーザールーム）
        socket.emit('matchEstablished', {
          matchId: newMatchPair.id,
          message,
          matchedAt: newMatchPair.matchedAt.toISOString(),
          matchedUserId: matchedUser.id,
          matchedUserName: matchedUser.name,
          targetUserId: senderId, // ユーザールーム宛
          chatId,                 // ★ 部屋宛ブロードキャストのため必須
        })
        // 受信者向け（ユーザールーム）
        socket.emit('matchEstablished', {
          matchId: newMatchPair.id,
          message,
          matchedAt: newMatchPair.matchedAt.toISOString(),
          matchedUserId: senderUser.id,
          matchedUserName: senderUser.name,
          targetUserId: matchedUserId, // ユーザールーム宛
          chatId,                      // ★ 部屋宛ブロードキャストのため必須
        })
      } finally {
        socket.disconnect()
      }

      return NextResponse.json({
        message: 'Match created!',
        matchedUserId: matchedUser.id,
        matchedUserName: matchedUser.name,
        chatId, // 参考返却
      })
    }

    // マッチ未成立
    return NextResponse.json({ message: 'Message sent, waiting for a match!' })
  } catch (error) {
    console.error('🚨 マッチングエラー:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}