// app/chat-list/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import FixedTabBar from '../components/FixedTabBar'
import Image from 'next/image'
import socket from '../socket'

// チャットリストアイテムの型定義
export interface ChatItem {
  chatId: string
  matchedUser: { id: string; name: string }
  matchMessage: string
  latestMessage: string
  latestMessageAt: string | null // ← null を許可
  latestMessageAtRaw: string | null
  latestMessageSenderId: string | null // ← null を許可
  latestMessageAtDisplay?: string
  messages: { id: string; senderId: string; content: string; createdAt: string }[]
  matchMessageMatchedAt?: string | null
  matchHistory?: { message: string; matchedAt: string }[]
}

// ユーザー名からイニシャル生成
function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()
}

// ユーザー名から背景色ハッシュ
function getBgColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = hash % 360
  return `hsl(${h}, 70%, 80%)`
}

function formatChatDate(dateString: string | null): string {
  if (!dateString) return ''
  const now = new Date()
  const date = new Date(dateString)
  if (
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate()
  ) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return '昨日'
  }
  for (let i = 2; i <= 5; i++) {
    const prev = new Date(now)
    prev.setDate(now.getDate() - i)
    if (
      date.getFullYear() === prev.getFullYear() &&
      date.getMonth() === prev.getMonth() &&
      date.getDate() === prev.getDate()
    ) {
      const week = ['日', '月', '火', '水', '木', '金', '土']
      return week[date.getDay()]
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

  // 開いたマッチチャットの状態をローカルストレージから読み込み（userIdごと）
  useEffect(() => {
    if (!userId) return
    if (typeof window !== 'undefined') {
      const openedMatchData = localStorage.getItem(`opened-match-chats-${userId}`)
      if (openedMatchData) {
        try {
          const openedMatchArray = JSON.parse(openedMatchData)
          setOpenedMatchChats(new Set(openedMatchArray))
        } catch (error) {
          console.error('開いたマッチチャットデータの読み込みエラー:', error)
        }
      }
      setIsOpenedMatchStateLoaded(true)
    } else {
      setIsOpenedMatchStateLoaded(true)
    }
  }, [userId])

  // newMatchChatsの状態をlocalStorageから読み込み（userIdごと）
  useEffect(() => {
    if (!userId) return
    if (typeof window !== 'undefined') {
      const newMatchData = localStorage.getItem(`new-match-chats-${userId}`)
      if (newMatchData) {
        try {
          const arr = JSON.parse(newMatchData)
          setNewMatchChats(new Set(arr))
        } catch {}
      }
    }
  }, [userId])

  // チャットリスト取得
  const fetchChats = async () => {
    const uid = typeof window !== 'undefined' ? localStorage.getItem('userId') : null
    if (!uid) return
    setIsLoading(true)
    try {
      const res = await axios.get<ChatItem[]>('/api/chat-list', {
        headers: { userId: uid }
      })
      const formatted = res.data
        .map((c) => ({
          ...c,
          latestMessageAtRaw: c.latestMessageAt,
          latestMessageAt: c.latestMessageAt
            ? new Date(c.latestMessageAt).toLocaleString('ja-JP', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : ''
        }))
        .sort(
          (a, b) =>
            (b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0) -
            (a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0)
        )
      setChats(formatted)

      // ここを追加: 既存チャットの部屋に全部 join
      formatted
      .filter(c => !c.chatId.startsWith('dummy-'))
      .forEach(c => socket.emit('joinChat', c.chatId)); 

      // 未読件数計算
      const unread: { [chatId: string]: number } = {}
      for (const chat of res.data) {
        if (!chat.latestMessageAt || chat.latestMessage === 'メッセージなし') continue
        if (chat.latestMessageSenderId === uid) {
          unread[chat.chatId] = 0
          continue
        }
        const lastRead = localStorage.getItem(`chat-last-read-${chat.chatId}`)
        const lastReadTime = lastRead ? new Date(lastRead).getTime() : 0
        const unreadCount = chat.messages.filter(
          (m) => new Date(m.createdAt).getTime() > lastReadTime && m.senderId !== uid
        ).length
        unread[chat.chatId] = unreadCount
      }
      setUnreadCounts(unread)
    } catch (e) {
      console.error('🚨 チャットリスト取得エラー:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setUserId(localStorage.getItem('userId'))
    if (isOpenedMatchStateLoaded) {
      fetchChats()
    }
  }, [isOpenedMatchStateLoaded])

  // チャットリスト取得時にmatchMessageの変化を検知（userIdごと）
  useEffect(() => {
    if (!isOpenedMatchStateLoaded || chats.length === 0 || !userId) return
    if (typeof window === 'undefined') return

    const prevMatchMessagesRaw = localStorage.getItem(`prev-match-messages-${userId}`)
    let prevMatchMessages: Record<string, string> = {}
    if (prevMatchMessagesRaw) {
      try {
        prevMatchMessages = JSON.parse(prevMatchMessagesRaw)
      } catch {}
    }

    const newMatchData = localStorage.getItem(`new-match-chats-${userId}`)
    let newSet = new Set<string>()
    if (newMatchData) {
      try {
        newSet = new Set(JSON.parse(newMatchData))
      } catch {}
    }
    let changed = false
    chats.forEach((chat) => {
      const prev = prevMatchMessages[chat.chatId]
      if (prev !== undefined && prev !== chat.matchMessage && !newSet.has(chat.chatId)) {
        newSet.add(chat.chatId)
        changed = true
      }
      if (
        prev === undefined &&
        chat.matchMessage &&
        chat.matchMessage !== '（マッチメッセージなし）' &&
        !newSet.has(chat.chatId)
      ) {
        newSet.add(chat.chatId)
        changed = true
      }
    })
    if (changed) {
      setNewMatchChats(newSet)
      localStorage.setItem(`new-match-chats-${userId}`, JSON.stringify(Array.from(newSet)))
    }

    const nextMatchMessages: Record<string, string> = {}
    chats.forEach((chat) => {
      nextMatchMessages[chat.chatId] = chat.matchMessage
    })
    localStorage.setItem(`prev-match-messages-${userId}`, JSON.stringify(nextMatchMessages))
  }, [chats, isOpenedMatchStateLoaded, userId])

  // WebSocketでマッチ通知を受信 → 新規マッチのハイライト
  useEffect(() => {
    if (!userId) return
    socket.emit('setUserId', userId)

    const handleMatchEstablished = (data: {
      matchId: string
      message: string
      matchedAt: string
      matchedUserId?: string
      matchedUserName?: string
      targetUserId?: string
    }) => {
      if (data.targetUserId && data.targetUserId !== userId) return

      if (data.matchedUserId) {
        const matchedChat = chats.find((chat) => chat.matchedUser.id === data.matchedUserId)
        if (matchedChat) {
          setNewMatchChats((prev) => {
            const newSet = new Set(prev)
            newSet.add(matchedChat.chatId)
            if (userId) localStorage.setItem(`new-match-chats-${userId}`, JSON.stringify(Array.from(newSet)))
            return newSet
          })
        }
      }
      // ついでにリスト更新（matchMessage 反映）
      fetchChats()
    }

    socket.on('matchEstablished', handleMatchEstablished)
    return () => {
      socket.off('matchEstablished', handleMatchEstablished)
    }
  }, [userId, chats])

  // WebSocketで新着メッセージ → リスト更新
  useEffect(() => {
    const handleNewMessage = () => fetchChats()
    socket.on('newMessage', handleNewMessage)
    return () => {
      socket.off('newMessage', handleNewMessage)
    }
  }, [])

  // ダミーIDなら ensure を呼んで実IDを取得してから遷移
  const handleOpenChat = async (item: ChatItem) => {
    const uid = localStorage.getItem('userId')
    if (!uid) return

    const goto = async (realId: string) => {
      localStorage.setItem(`chat-last-read-${realId}`, new Date().toISOString())
      setUnreadCounts((prev) => ({ ...prev, [realId]: 0 }))
      setOpenedMatchChats((prev) => {
        const next = new Set(prev)
        next.add(realId)
        if (userId) localStorage.setItem(`opened-match-chats-${userId}`, JSON.stringify(Array.from(next)))
        return next
      })
      setNewMatchChats((prev) => {
        const next = new Set(prev)
        next.delete(realId)
        if (userId) localStorage.setItem(`new-match-chats-${userId}`, JSON.stringify(Array.from(next)))
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

        // ローカルの一覧上もダミーID→実IDへ置換
        setChats((prev) =>
          prev.map((c) => (c.chatId === item.chatId ? { ...c, chatId: realId } : c))
        )
        await goto(realId)
      } catch (e) {
        console.error('🚨 ensure エラー:', e)
      }
    } else {
      await goto(item.chatId)
    }
  }

  // newMatchChats が最上位に来る + それ以外は従来の最新メッセージ順
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
      {/* 固定ヘッダー */}
      <div className="shrink-0 bg-white/80 backdrop-blur-sm z-10 p-6 border-b border-gray-100 shadow-sm">
        <h1 className="text-2xl font-bold text-center text-gray-800">Chat</h1>
      </div>

      {/* スクロール可能リスト */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {!isOpenedMatchStateLoaded || (isLoading && chats.length === 0) ? (
          <div className="flex flex-col items中心 justify-center py-12">
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
              const isMatched =
                chat.matchMessage !== '（マッチメッセージなし）'
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
                  {/* アイコン */}
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
                        <Image src="/icons/check2.png" alt="Match" width={12} height={12} className="text-white" />
                      </div>
                    )}
                  </div>
                  {/* 本文 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-gray-800 truncate">{chat.matchedUser.name}</span>
                      <div className="flex flex-col items-end min-w-[60px]">
                        <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                          {chat.latestMessageAtDisplay || formatChatDate(chat.latestMessageAtRaw)}
                        </span>
                        {/* 未読バッジ */}
                        {unreadCounts[chat.chatId] > 0 && !isLatestFromMe && (
                          <span className="mt-1 flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-r from-green-400 to-green-500 text-white text-xs font-bold shadow-md">
                            {unreadCounts[chat.chatId]}
                          </span>
                        )}
                      </div>
                    </div>
                    <p
                      className={`text-sm truncate mb-1 font-medium ${
                        shouldShowMatchHighlight ? 'text-orange-700 font-semibold' : isMatched ? 'text-gray-600' : 'text-gray-400'
                      }`}
                    >
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

      {/* 下部タブバー */}
      <div className="shrink-0">
        <FixedTabBar />
      </div>
    </div>
  )
}