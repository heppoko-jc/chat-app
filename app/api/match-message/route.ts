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

    // 2) マッチ未成立の場合
    if (!matchedUserId) {
      return NextResponse.json({ message: 'Message sent, waiting for a match!' })
    }

    // 3) ユーザー情報の取得
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

    // 4) PresetMessage のカウントを更新 / 作成
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

    // 5) MatchPair を作成（履歴として毎回記録）
    const newMatchPair = await prisma.matchPair.create({
      data: { user1Id: senderId, user2Id: matchedUserId, message }
    })

    // 6) ← ここが重要：2人のチャットルームを ensure して chatId を取得
    const [u1, u2] = senderId < matchedUserId ? [senderId, matchedUserId] : [matchedUserId, senderId]
    let chat = await prisma.chat.findFirst({
      where: {
        OR: [
          { user1Id: u1, user2Id: u2 },
          { user1Id: u2, user2Id: u1 },
        ],
      },
      select: { id: true },
    })
    if (!chat) {
      chat = await prisma.chat.create({
        data: { user1Id: u1, user2Id: u2 },
        select: { id: true },
      })
    }
    const chatId = chat.id

    // 7) Web Push 通知（任意だが、クリック遷移などで使えるように chatId も payload に含める）
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
          chatId, // 追加：通知クリックで該当チャットへ遷移可能に
          title: 'マッチング成立！',
          body: `あなたは ${other.name} さんと「${message}」でマッチしました！`,
          matchedUserId: other.id,
          matchedUserName: other.name
        })
        return webpush.sendNotification(s.subscription as unknown as WebPushSubscription, payload)
      })
    )

    // 8) WebSocket でリアルタイム通知（両者へ）
    const socket = ioClient(SOCKET_URL, { transports: ['websocket'] })

    // 送信者（senderId）へ
    socket.emit('matchEstablished', {
      chatId, // ★ 追加（チャット画面の newMatch 購読がこれを使う）
      matchId: newMatchPair.id,
      message,
      matchedAt: newMatchPair.matchedAt.toISOString(),
      matchedUserId: matchedUser.id,
      matchedUserName: matchedUser.name,
      targetUserId: senderId // ユーザールーム配信用
    })

    // 受信者（matchedUserId）へ
    socket.emit('matchEstablished', {
      chatId, // ★ 追加
      matchId: newMatchPair.id,
      message,
      matchedAt: newMatchPair.matchedAt.toISOString(),
      matchedUserId: senderUser.id,
      matchedUserName: senderUser.name,
      targetUserId: matchedUserId // ユーザールーム配信用
    })

    socket.disconnect()

    return NextResponse.json({
      message: 'Match created!',
      matchedUserId: matchedUser.id,
      matchedUserName: matchedUser.name,
      chatId, // 返しておくとクライアント側のデバッグにも便利
    })
  } catch (error) {
    console.error('🚨 マッチングエラー:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}