import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // 全ユーザー取得（自分以外）
    const users = await prisma.user.findMany({
      where: { id: { not: userId } },
      select: { id: true, name: true }
    })

    // 既存チャット取得
    const chats = await prisma.chat.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }]
      },
      include: {
        user1: { select: { id: true, name: true } },
        user2: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'desc' }
          // take: 1 ← 削除（全件取得）
        }
      }
    })

    // ユーザーごとにチャット情報を作成
    const chatList = await Promise.all(
      users.map(async (u) => {
        // 既存チャットがあるか
        const chat = chats.find((c) => c.user1Id === u.id || c.user2Id === u.id)
        if (chat) {
          const matchedUser = chat.user1Id === userId ? chat.user2 : chat.user1
          const latestMessage = chat.messages.length > 0 ? chat.messages[0].content : 'メッセージなし'
          const latestMessageAt = chat.messages.length > 0 ? chat.messages[0].createdAt : chat.createdAt
          const latestMessageSenderId = chat.messages.length > 0 ? chat.messages[0].senderId : null
          // MatchPair テーブルから全てのマッチ履歴を取得
          const matchHistory = await prisma.matchPair.findMany({
            where: {
              OR: [
                { user1Id: chat.user1Id, user2Id: chat.user2Id },
                { user1Id: chat.user2Id, user2Id: chat.user1Id }
              ]
            },
            orderBy: { matchedAt: 'asc' },
            select: { message: true, matchedAt: true }
          })
          // 最新のマッチだけ従来通り
          const matchPair = matchHistory.length > 0 ? matchHistory[matchHistory.length - 1] : null
          return {
            chatId: chat.id,
            matchedUser: {
              id: matchedUser.id,
              name: matchedUser.name
            },
            matchMessage: matchPair?.message || '（マッチメッセージなし）',
            matchMessageMatchedAt: matchPair?.matchedAt || null,
            matchHistory,
            latestMessage,
            latestMessageAt,
            latestMessageSenderId,
            messages: chat.messages.map((m) => ({
              id: m.id,
              senderId: m.senderId,
              content: m.content,
              createdAt: m.createdAt
            }))
          }
        } else {
          // チャットが未作成の場合のダミー
          return {
            chatId: `dummy-${u.id}`,
            matchedUser: { id: u.id, name: u.name },
            matchMessage: '（マッチメッセージなし）',
            latestMessage: 'メッセージなし',
            latestMessageAt: null,
            latestMessageSenderId: null,
            messages: []
          }
        }
      })
    )

    // 最新メッセージ日時で降順ソート（nullは一番下）
    chatList.sort((a, b) => {
      if (!a.latestMessageAt) return 1
      if (!b.latestMessageAt) return -1
      return new Date(b.latestMessageAt).getTime() - new Date(a.latestMessageAt).getTime()
    })

    return NextResponse.json(chatList)
  } catch (error) {
    console.error('🚨 チャットリスト取得エラー:', error)
    return NextResponse.json({ error: 'Failed to fetch chat list' }, { status: 500 })
  }
}