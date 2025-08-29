// app/chat/[chatId]/page.tsx
'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import axios from 'axios'
import socket from '@/app/socket'
import Image from 'next/image'
import { useChatData } from '@/app/contexts/ChatDataContext'

// ヘルパー
function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()
}
function getBgColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = hash % 360
  return `hsl(${h}, 70%, 80%)`
}

export type Message = {
  id: string
  sender: { id: string; name: string }
  content: string
  createdAt: string
  formattedDate?: string
}

type PendingTemp = {
  tempId: string
  content: string
  createdAt: string // ISO
  senderId: string
}

export default function Chat() {
  const router = useRouter()
  const params = useParams()
  const id = Array.isArray(params?.chatId) ? params.chatId[0] : (params?.chatId as string)

  const { chatData, chatList, isPreloading, setChatData, setChatList } = useChatData()
  const initialMessages = chatData[id] as Message[] | undefined

  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [matchMessage, setMatchMessage] = useState<string>('')
  const [matchMessageMatchedAt, setMatchMessageMatchedAt] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [matchHistory, setMatchHistory] = useState<{ message: string; matchedAt: string }[]>([])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)

  // 二重反映ガード：受信済みID
  const seenIdsRef = useRef<Set<string>>(new Set())
  // 自分が出した「仮メッセージ」の対応付け
  const pendingFromMeRef = useRef<PendingTemp[]>([])

  // ログインユーザーID
  useEffect(() => {
    setCurrentUserId(localStorage.getItem('userId'))
  }, [])

  // ダミーIDで直接アクセスは一覧へ戻す
  useEffect(() => {
    if (id?.startsWith('dummy-')) {
      router.replace('/chat-list')
    }
  }, [id, router])

  // Contextからマッチ情報・相手情報
  const chatInList = chatList?.find((c) => c.chatId === id)
  useEffect(() => {
    if (chatInList) {
      setMatchMessage(chatInList.matchMessage || '')
      setMatchMessageMatchedAt(chatInList.matchMessageMatchedAt || null)
      setMatchHistory(
        (chatInList.matchHistory || [])
          .slice()
          .sort((a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime())
      )
    }
  }, [chatInList])

  // 事前フェッチ分
  useEffect(() => {
    if (initialMessages) setMessages(initialMessages)
  }, [initialMessages])

  // 初期スクロール
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        if (mainRef.current) mainRef.current.scrollTop = mainRef.current.scrollHeight
      }, 100)
    }
  }, [messages.length])

  // API取得 & ソケット参加
  useEffect(() => {
    if (!id || id.startsWith('dummy-') || initialMessages || isPreloading) return

    ;(async () => {
      try {
        const res = await axios.get<Message[]>(`/api/chat/${id}`)
        const formatted = res.data.map((msg) => ({
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        }))
        // 受信済みIDセットも初期化
        seenIdsRef.current = new Set(formatted.map((m) => m.id))
        setMessages(formatted)
      } catch (e) {
        console.error('🚨 メッセージ取得エラー:', e)
      }
    })()

    socket.emit('joinChat', id)

    // ——— 新着メッセージ（サーバー発）
    const handleNewMessage = (payload: { chatId: string; message: Message }) => {
      if (payload.chatId !== id) return
      const incoming = payload.message

      // 二重反映ガード：同じIDはスキップ
      if (seenIdsRef.current.has(incoming.id)) return
      seenIdsRef.current.add(incoming.id)

      const formatted: Message = {
        ...incoming,
        formattedDate: new Date(incoming.createdAt).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit'
        })
      }

      const me = currentUserId
      const isMine = me && incoming.sender.id === me

      setMessages((prev) => {
        // 自分の送信で、近い時刻＆同じ内容の仮メッセージがあれば置換
        if (isMine) {
          const now = new Date(incoming.createdAt).getTime()
          const idx = pendingFromMeRef.current.findIndex((p) => {
            if (p.senderId !== me) return false
            if (p.content !== incoming.content) return false
            const diff = Math.abs(now - new Date(p.createdAt).getTime())
            return diff <= 15_000 // 15秒以内なら同一扱い
          })
          if (idx >= 0) {
            const tempId = pendingFromMeRef.current[idx].tempId
            pendingFromMeRef.current.splice(idx, 1)
            return prev.map((m) => (m.id === tempId ? formatted : m))
          }
        }
        // 置換対象が無ければ単純に末尾に追加
        return [...prev, formatted]
      })

      // ContextのchatDataを更新（id をキーに）
      setChatData((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), formatted]
      }))

      // ContextのchatListを更新（最新メッセージ情報）
      if (chatList) {
        const updatedChatList = chatList
          .map((chat) =>
            chat.chatId === id
              ? {
                  ...chat,
                  latestMessage: incoming.content,
                  latestMessageAt: incoming.createdAt as unknown as string,
                  latestMessageSenderId: incoming.sender.id,
                  latestMessageAtDisplay: new Date(incoming.createdAt).toLocaleString('ja-JP', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                }
              : chat
          )
          .sort((a, b) => {
            const ta = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0
            const tb = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0
            return tb - ta
          })
        setChatList(updatedChatList)
      }
    }

    // ——— マッチ通知（互換: newMatch / matchEstablished）
    const handleMatch = (data: {
      matchId?: string
      chatId?: string
      message: string
      matchedAt: string
      matchedUserId?: string
      matchedUserName?: string
      targetUserId?: string
    }) => {
      // 同じチャットIDに限定（安全側）
      if (data.chatId && data.chatId !== id) return

      setMatchMessage(data.message)
      setMatchMessageMatchedAt(data.matchedAt)
      setMatchHistory((prev) =>
        [...prev, { message: data.message, matchedAt: data.matchedAt }].sort(
          (a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
        )
      )

      if (chatList) {
        const updated = chatList.map((c) =>
          c.chatId === id
            ? {
                ...c,
                matchMessage: data.message,
                matchMessageMatchedAt: data.matchedAt,
                matchHistory: [...(c.matchHistory || []), { message: data.message, matchedAt: data.matchedAt }].sort(
                  (a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
                )
              }
            : c
        )
        setChatList(updated)
      }
    }

    socket.on('newMessage', handleNewMessage)
    socket.on('newMatch', handleMatch)
    socket.on('matchEstablished', handleMatch)

    return () => {
      socket.off('newMessage', handleNewMessage)
      socket.off('newMatch', handleMatch)
      socket.off('matchEstablished', handleMatch)
    }
  }, [id, initialMessages, isPreloading, setChatData, chatList, setChatList, currentUserId])

  // メッセージ更新時スクロール
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = mainRef.current.scrollHeight
  }, [messages])

  // 送信（POST 後は Socket の到着に任せる）
  const handleSend = async () => {
    if (!id || id.startsWith('dummy-') || !newMessage.trim() || isSending) return
    const senderId = localStorage.getItem('userId')
    if (!senderId) {
      alert('ログインしてください')
      return
    }

    setIsSending(true)
    const contentToSend = newMessage
    setNewMessage('')
    setTimeout(() => inputRef.current?.focus(), 0)

    // 仮表示（temp）
    const tempId = `temp-${Date.now()}`
    const tempCreatedAt = new Date().toISOString()
    const tempMessage: Message = {
      id: tempId,
      sender: { id: senderId, name: '自分' },
      content: contentToSend,
      createdAt: tempCreatedAt,
      formattedDate: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    }
    setMessages((prev) => [...prev, tempMessage])
    // 楽観キューに登録
    pendingFromMeRef.current.push({
      tempId,
      content: contentToSend,
      createdAt: tempCreatedAt,
      senderId
    })

    try {
      // サーバー保存（※ここでは messages へは追加しない）
      await axios.post<Message>(`/api/chat/${id}`, { senderId, content: contentToSend })
      // Socket の newMessage 到着で仮メッセージを置換する
    } catch (e) {
      console.error('🚨 送信エラー:', e)
      // 失敗時は仮メッセージを取り消す
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      pendingFromMeRef.current = pendingFromMeRef.current.filter((p) => p.tempId !== tempId)
    } finally {
      setIsSending(false)
    }
  }

  // ====== ヘッダーの相手表示（メッセージが無くても色/イニシャルを出す）======
  const partnerNameFromList = chatInList?.matchedUser.name
  const partnerFromMsgs = messages.find((m) => m.sender.id !== currentUserId)?.sender.name
  const headerName = partnerNameFromList || partnerFromMsgs || 'チャット'
  const headerInitials = headerName ? getInitials(headerName) : ''
  const headerColor = partnerNameFromList
    ? getBgColor(partnerNameFromList)
    : partnerFromMsgs
    ? getBgColor(partnerFromMsgs)
    : '#ccc'

  // ====== タイムライン描画（メッセージとマッチを時系列マージ）======
  function renderMessagesWithDate(msgs: Message[]) {
    const result: React.ReactElement[] = []
    let lastDate = ''

    const ensureDateBar = (iso: string) => {
      const d = new Date(iso)
      const key = d.toISOString().slice(0, 10)
      if (key !== lastDate) {
        result.push(
          <div key={`date-${key}`} className="flex justify-center my-2">
            <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full shadow-sm">
              {key.replace(/-/g, '/')}
            </span>
          </div>
        )
        lastDate = key
      }
    }

    const matches = (matchHistory || []).slice().sort(
      (a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
    )

    // メッセージが0件なら、マッチのみを描画
    if (msgs.length === 0) {
      matches.forEach((m, idx) => {
        ensureDateBar(m.matchedAt)
        result.push(
          <div key={`match-only-${idx}-${m.matchedAt}`} className="flex justify-center my-2">
            <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
              マッチしたことば: 「{m.message}」
            </span>
          </div>
        )
      })
      return result
    }

    // メッセージがある場合は、時系列でマージ
    let mi = 0
    for (const msg of msgs) {
      const msgTs = new Date(msg.createdAt).getTime()

      // このメッセージより前（同時刻含む）に発生したマッチを全て挿入
      while (mi < matches.length && new Date(matches[mi].matchedAt).getTime() <= msgTs) {
        const m = matches[mi]
        ensureDateBar(m.matchedAt)
        result.push(
          <div key={`match-before-${mi}-${m.matchedAt}`} className="flex justify-center my-2">
            <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
              マッチしたことば: 「{m.message}」
            </span>
          </div>
        )
        mi++
      }

      // メッセージ本体
      ensureDateBar(msg.createdAt)
      const isMe = msg.sender.id === currentUserId
      result.push(
        <div key={msg.id} className={`flex items-end ${isMe ? 'justify-end' : 'justify-start'} w-full`}>
          {!isMe && (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-base mr-2 shadow"
              style={{ backgroundColor: getBgColor(msg.sender.name) }}
            >
              {getInitials(msg.sender.name)}
            </div>
          )}
          <div className="flex flex-col items-end max-w-[70%]">
            <div
              className={`relative px-4 py-2 text-sm rounded-2xl shadow-md ${
                isMe
                  ? 'bg-green-400 text-white rounded-br-md bubble-right'
                  : 'bg-white text-black rounded-bl-md bubble-left border border-gray-200'
              }`}
              style={{ wordBreak: 'break-word' }}
            >
              {msg.content}
            </div>
            <span className={`text-[10px] mt-1 ${isMe ? 'text-green-500' : 'text-gray-400'}`}>{msg.formattedDate}</span>
          </div>
        </div>
      )
    }

    // 最後のメッセージ以降に発生したマッチを末尾に挿入
    while (mi < matches.length) {
      const m = matches[mi]
      ensureDateBar(m.matchedAt)
      result.push(
        <div key={`match-after-${mi}-${m.matchedAt}`} className="flex justify-center my-2">
          <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
            マッチしたことば: 「{m.message}」
          </span>
        </div>
      )
      mi++
    }

    return result
  }

  if (isPreloading && messages.length === 0) {
    return (
      <div className="flex flex-col bg-white h-screen">
        <header className="sticky top-0 z-10 bg-white px-4 py-2 flex flex-col items-center">
          <button onClick={() => router.push('/chat-list')} className="absolute left-4 top-2 focus:outline-none">
            <Image src="/icons/back.png" alt="Back" width={20} height={20} />
          </button>
          <h1 className="text-base font-bold text-black">読み込み中...</h1>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">チャットデータを読み込み中...</div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-[#f6f8fa] h-screen overflow-x-hidden">
      {/* ヘッダー */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-white px-4 py-3 flex items-center border-b">
        <button onClick={() => router.push('/chat-list')} className="mr-3 focus:outline-none">
          <Image src="/icons/back.png" alt="Back" width={24} height={24} />
        </button>
        <div className="flex flex-col">
          <div className="flex items-center">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mr-2 shadow"
              style={{ backgroundColor: headerColor }}
            >
              {headerInitials}
            </div>
            <span className="text-base font-bold text-black">{headerName}</span>
          </div>
          {!!matchMessage && (
            <span className="text-xs text-gray-500 mt-1">
              「{matchMessage}」
              {matchMessageMatchedAt
                ? ` / ${new Date(matchMessageMatchedAt).toLocaleString('ja-JP', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}`
                : ''}
            </span>
          )}
        </div>
      </header>

      {/* メッセージ一覧 */}
      <main ref={mainRef} className="flex-1 px-2 pt-20 overflow-y-auto overflow-x-hidden pb-32 scrollbar-hide">
        <div className="flex flex-col gap-1 py-2">{renderMessagesWithDate(messages)}</div>
        <div ref={messagesEndRef} className="h-6" />
      </main>

      {/* 入力欄 */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="メッセージを入力"
          className="flex-1 border border-gray-200 rounded-full px-4 py-2 focus:outline-none bg-gray-50 text-base shadow-sm"
        />
        <button
          onClick={handleSend}
          className="ml-2 p-2 rounded-full bg-green-400 hover:bg-green-500 transition shadow-lg"
        >
          <Image src={newMessage.trim() ? '/icons/send.png' : '/icons/message.png'} alt="Send" width={28} height={28} />
        </button>
      </footer>

      {/* 吹き出しのトゲ（LINE風） */}
      <style jsx global>{`
        .bubble-left::before {
          content: '';
          position: absolute;
          top: 12px;
          left: -8px;
          width: 16px;
          height: 16px;
          background: #fff;
          border-left: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          transform: rotate(45deg);
          border-radius: 4px;
          z-index: 0;
        }
        .bubble-right::before {
          content: '';
          position: absolute;
          top: 12px;
          right: -8px;
          width: 16px;
          height: 16px;
          background: #4ade80;
          transform: rotate(45deg);
          border-radius: 4px;
          z-index: 0;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}