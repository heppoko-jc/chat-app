'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import FixedTabBar from '../components/FixedTabBar'
import Image from 'next/image'
import socket, { setSocketUserId } from '../socket' // ← 変更

// チャットリストアイテムの型定義
export interface ChatItem {
  chatId: string
  matchedUser: { id: string; name: string }
  matchMessage: string
  latestMessage: string
  latestMessageAt: string | null
  latestMessageAtRaw: string | null
  latestMessageSenderId: string | null
  latestMessageAtDisplay?: string
  messages: { id: string; senderId: string; content: string; createdAt: string }[]
  matchMessageMatchedAt?: string | null
  matchHistory?: { message: string; matchedAt: string }[]
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w.charAt(0)).join('').toUpperCase()
}
function getBgColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 80%)`
}

function formatChatDate(dateString: string | null): string {
  if (!dateString) return ''
  const now = new Date()
  const date = new Date(dateString)
  if (now.toDateString() === date.toDateString()) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (yesterday.toDateString() === date.toDateString()) return '昨日'
  for (let i = 2; i <= 5; i++) {
    const prev = new Date(now); prev.setDate(now.getDate() - i)
    if (prev.toDateString() === date.toDateString()) {
      const week = ['日','月','火','水','木','金','土']; return week[date.getDay()]
    }
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export default function ChatList() {
  const router = useRouter()
  const [chats, setChats] = useState<ChatItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<{ [chatId: string]: number }>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [openedMatchChats, setOpenedMatchChats] = useState<Set<string>>(new Set())
  const [isOpenedMatchStateLoaded, setIsOpenedMatchStateLoaded] = useState(false)
  const [newMatchChats, setNewMatchChats] = useState<Set<string>>(new Set())

  // 開いたマッチチャット状態のロード
  useEffect(() => {
    const uid = typeof window !== 'undefined' ? localStorage.getItem('userId') : null
    setUserId(uid)
  }, [])
  useEffect(() => {
    if (!userId) return
    setSocketUserId(userId) // ← 接続/再接続時に確実にユーザールームへ

    const openedMatchData = localStorage.getItem(`opened-match-chats-${userId}`)
    if (openedMatchData) {
      try { setOpenedMatchChats(new Set(JSON.parse(openedMatchData))) } catch {}
    }
    setIsOpenedMatchStateLoaded(true)

    const newMatchData = localStorage.getItem(`new-match-chats-${userId}`)
    if (newMatchData) {
      try { setNewMatchChats(new Set(JSON.parse(newMatchData))) } catch {}
    }
  }, [userId])

  // 一覧取得
  const fetchChats = async () => {
    const uid = typeof window !== 'undefined' ? localStorage.getItem('userId') : null
    if (!uid) return
    setIsLoading(true)
    try {
      const res = await axios.get<ChatItem[]>('/api/chat-list', { headers: { userId: uid } })
      const formatted = res.data
        .map((c) => ({
          ...c,
          latestMessageAtRaw: c.latestMessageAt,
          latestMessageAt: c.latestMessageAt
            ? new Date(c.latestMessageAt).toLocaleString('ja-JP', {
                month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
              })
            : ''
        }))
        .sort((a, b) =>
          (b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0) -
          (a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0)
        )
      setChats(formatted)

      // 取得した実チャットは全て join（マッチ直後の newMessage も拾えるように）
      formatted.filter(c => !c.chatId.startsWith('dummy-')).forEach(c => socket.emit('joinChat', c.chatId))

      // 未読件数
      const unread: { [chatId: string]: number } = {}
      for (const chat of res.data) {
        if (!chat.latestMessageAt || chat.latestMessage === 'メッセージなし') continue
        if (chat.latestMessageSenderId === uid) { unread[chat.chatId] = 0; continue }
        const lastRead = localStorage.getItem(`chat-last-read-${chat.chatId}`)
        const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0
        unread[chat.chatId] = chat.messages.filter(
          (m) => new Date(m.createdAt).getTime() > lastReadTime && m.senderId !== uid
        ).length
      }
      setUnreadCounts(unread)
    } catch (e) {
      console.error('🚨 チャットリスト取得エラー:', e)
    } finally {
      setIsLoading(false)
    }
  }

  // 初回ロード
  useEffect(() => {
    if (isOpenedMatchStateLoaded) fetchChats()
  }, [isOpenedMatchStateLoaded])

  // matchMessageの変化検知（ローカル保存）
  useEffect(() => {
    if (!isOpenedMatchStateLoaded || chats.length === 0 || !userId) return
    const prevRaw = localStorage.getItem(`prev-match-messages-${userId}`)
    let prevMap: Record<string, string> = {}
    if (prevRaw) { try { prevMap = JSON.parse(prevRaw) } catch {} }

    const newRaw = localStorage.getItem(`new-match-chats-${userId}`)
    let newSet = new Set<string>(); if (newRaw) { try { newSet = new Set(JSON.parse(newRaw)) } catch {} }

    let changed = false
    for (const chat of chats) {
      const prev = prevMap[chat.chatId]
      if (prev !== undefined && prev !== chat.matchMessage && !newSet.has(chat.chatId)) {
        newSet.add(chat.chatId); changed = true
      }
      if (prev === undefined && chat.matchMessage && chat.matchMessage !== '（マッチメッセージなし）' && !newSet.has(chat.chatId)) {
        newSet.add(chat.chatId); changed = true
      }
    }
    if (changed) {
      setNewMatchChats(newSet)
      localStorage.setItem(`new-match-chats-${userId}`, JSON.stringify([...newSet]))
    }

    const nextMap: Record<string, string> = {}
    chats.forEach((c) => { nextMap[c.chatId] = c.matchMessage })
    localStorage.setItem(`prev-match-messages-${userId}`, JSON.stringify(nextMap))
  }, [chats, isOpenedMatchStateLoaded, userId])

  // WebSocket: マッチ成立（ユーザールーム経由）
  useEffect(() => {
    if (!userId) return
    const handleMatchEstablished = (data: {
      chatId?: string
      message: string
      matchedAt: string
      matchedUserId?: string
      targetUserId?: string
    }) => {
      // 自分宛以外はスキップ
      if (data.targetUserId && data.targetUserId !== userId) return

      const realChatId = data.chatId // ← 重要：実チャットID
      if (realChatId) {
        // 実チャットルームにも join（この後の newMessage も拾える）
        socket.emit('joinChat', realChatId)

        // ダミー → 実ID の置換をローカルで即時反映
        setChats((prev) => {
          // 対象ユーザーの項目を探す
          const idx = prev.findIndex(c => c.matchedUser.id === data.matchedUserId || c.chatId === realChatId)
          if (idx === -1) return prev
          const next = [...prev]
          const item = { ...next[idx] }

          // ID 置換（dummy のままなら）
          if (item.chatId.startsWith('dummy-')) item.chatId = realChatId

          // マッチ文言を即時反映（fetch を待たずにリッチ化）
          item.matchMessage = data.message
          item.matchMessageMatchedAt = data.matchedAt
          item.matchHistory = [...(item.matchHistory || []), { message: data.message, matchedAt: data.matchedAt }]

          next[idx] = item
          return next
        })

        // ハイライト用の集合は「実ID」を追加（dummy は入れない）
        setNewMatchChats((prev) => {
          const next = new Set(prev); next.add(realChatId)
          if (userId) localStorage.setItem(`new-match-chats-${userId}`, JSON.stringify([...next]))
          return next
        })
      }

      // 最終的にサーバー状態で再同期
      fetchChats()
    }

    socket.on('matchEstablished', handleMatchEstablished)
    return () => { socket.off('matchEstablished', handleMatchEstablished) }
  }, [userId])

  // WebSocket: 新着メッセージで再取得
  useEffect(() => {
    const handleNewMessage = () => fetchChats()
    socket.on('newMessage', handleNewMessage)
    return () => { socket.off('newMessage', handleNewMessage) }
  }, [])

  // クリックで既読＆ハイライト解除
  const handleOpenChat = async (item: ChatItem) => {
    const uid = localStorage.getItem('userId'); if (!uid) return

    const goto = async (realId: string) => {
      localStorage.setItem(`chat-last-read-${realId}`, new Date().toISOString())
      setUnreadCounts((prev) => ({ ...prev, [realId]: 0 }))
      setOpenedMatchChats((prev) => {
        const next = new Set(prev); next.add(realId)
        if (userId) localStorage.setItem(`opened-match-chats-${userId}`, JSON.stringify([...next]))
        return next
      })
      setNewMatchChats((prev) => {
        const next = new Set(prev); next.delete(realId)
        if (userId) localStorage.setItem(`new-match-chats-${userId}`, JSON.stringify([...next]))
        return next
      })
      router.push(`/chat/${realId}`)
    }

    if (item.chatId.startsWith('dummy-')) {
      try {
        const res = await axios.post<{ chatId: string }>(
          '/api/chat/ensure',
          { partnerId: item.matchedUser.id },
          { headers: { userId: uid } }
        )
        const realId = res.data.chatId
        setChats((prev) => prev.map((c) => (c.chatId === item.chatId ? { ...c, chatId: realId } : c)))
        await goto(realId)
      } catch (e) {
        console.error('🚨 ensure エラー:', e)
      }
    } else {
      await goto(item.chatId)
    }
  }

  const sortedChats = [...chats].sort((a, b) => {
    const aIsNew = newMatchChats.has(a.chatId)
    const bIsNew = newMatchChats.has(b.chatId)
    if (aIsNew && !bIsNew) return -1
    if (!aIsNew && bIsNew) return 1
    const aTime = a.latestMessageAtRaw ? new Date(a.latestMessageAtRaw).getTime() : 0
    const bTime = b.latestMessageAtRaw ? new Date(b.latestMessageAtRaw).getTime() : 0
    return bTime - aTime
  })

  return (
    <div className="flex flex-col h-[100dvh] bg-gradient-to-b from-gray-50 to-white overflow-hidden">
      <div className="shrink-0 bg-white/80 backdrop-blur-sm z-10 p-6 border-b border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-center text-gray-800">Chat</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {!isOpenedMatchStateLoaded || (isLoading && chats.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-medium">読み込み中…</p>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-gray-500 font-medium">まだチャットがありません</p>
            <p className="text-gray-400 text-sm mt-1">メイン画面でメッセージを送信してみてください</p>
          </div>
        ) : (
          <ul className="space-y-2 pb-20">
            {sortedChats.map((chat) => {
              const isLatestFromMe = chat.latestMessageSenderId === userId
              const isMatched = chat.matchMessage !== '（マッチメッセージなし）'
              const hasOpenedMatch = openedMatchChats.has(chat.chatId)
              const isNewMatch = newMatchChats.has(chat.chatId)
              const shouldShowMatchHighlight = (isMatched && !hasOpenedMatch) || isNewMatch
              return (
                <li
                  key={chat.chatId}
                  onClick={() => handleOpenChat(chat)}
                  className={`flex items-center backdrop-blur-sm rounded-3xl shadow-lg px-5 py-4 cursor-pointer hover:shadow-xl active:scale-98 transition-all duration-200 border mb-3 ${
                    shouldShowMatchHighlight
                      ? 'bg-gradient-to-r from-orange-100 to-orange-200 border-orange-300 shadow-orange-300/50'
                      : 'bg-white/90 border-white/50 hover:bg-white'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl mr-4 shadow-lg ${
                        shouldShowMatchHighlight ? 'ring-2 ring-orange-300 ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: getBgColor(chat.matchedUser.name) }}
                    >
                      {getInitials(chat.matchedUser.name)}
                    </div>
                    {shouldShowMatchHighlight && (
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                        <Image src="/icons/check2.png" alt="Match" width={12} height={12} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-gray-800 truncate">{chat.matchedUser.name}</span>
                      <div className="flex flex-col items-end min-w-[60px]">
                        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                          {chat.latestMessageAtDisplay || formatChatDate(chat.latestMessageAtRaw)}
                        </span>
                        {unreadCounts[chat.chatId] > 0 && !isLatestFromMe && (
                          <span className="mt-1 flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-r from-green-400 to-green-500 text-white text-xs font-bold shadow-md">
                            {unreadCounts[chat.chatId]}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className={`text-sm truncate mb-1 font-medium ${
                      shouldShowMatchHighlight ? 'text-orange-700 font-semibold' : isMatched ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {isMatched ? `「${chat.matchMessage}」` : 'まだマッチしていません'}
                    </p>
                    <p className="text-sm text-gray-500 truncate">{chat.latestMessage}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0">
        <FixedTabBar />
      </div>
    </div>
  )
}