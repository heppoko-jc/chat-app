// app/chat/[chatId]/page.tsx
'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import axios from 'axios'
import socket from '@/app/socket'
import Image from 'next/image'
import { useChatData } from '@/app/contexts/ChatDataContext'

function getInitials(name: string) {
  return name.split(' ').map((w) => w.charAt(0)).join('').toUpperCase()
}
function getBgColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
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

function isNear(aIso: string, bIso: string, ms = 7000) {
  const a = new Date(aIso).getTime()
  const b = new Date(bIso).getTime()
  return Math.abs(a - b) <= ms
}

type MatchPayload = {
  chatId?: string
  message: string
  matchedAt: string
}

export default function Chat() {
  const router = useRouter()
  const params = useParams()
  const id = Array.isArray(params?.chatId) ? params.chatId[0] : (params?.chatId as string)

  const { chatData, chatList, isPreloading, setChatData, setChatList } = useChatData()
  const initialMessages = chatData[id] as Message[] | undefined

  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [newMessage, setNewMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [matchMessage, setMatchMessage] = useState<string>('')
  const [matchMessageMatchedAt, setMatchMessageMatchedAt] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [matchHistory, setMatchHistory] = useState<{ message: string; matchedAt: string }[]>([])

  const mainRef = useRef<HTMLDivElement | null>(null)

  // 受信済みID
  const seenIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!id) return
    const set = seenIdsRef.current
    set.clear()
    ;(initialMessages ?? []).forEach((m) => set.add(m.id))
  }, [id, initialMessages])

  useEffect(() => { setCurrentUserId(localStorage.getItem('userId')) }, [])
  useEffect(() => { if (id?.startsWith('dummy-')) router.replace('/chat-list') }, [id, router])

  const chatInList = chatList?.find((c) => c.chatId === id)
  useEffect(() => {
    if (!chatInList) return
    setMatchMessage(chatInList.matchMessage || '')
    setMatchMessageMatchedAt(chatInList.matchMessageMatchedAt || null)
    setMatchHistory(
      (chatInList.matchHistory || []).slice().sort((a, b) =>
        new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
      )
    )
  }, [chatInList])

  // メッセージ購読
  useEffect(() => {
    if (!id || id.startsWith('dummy-')) return
    socket.emit('joinChat', id)

    const upsertFromServer = (msg: Message) => {
      if (seenIdsRef.current.has(msg.id)) return
      seenIdsRef.current.add(msg.id)

      setMessages((prev) => {
        const idx = prev.findIndex(
          (m) => m.id.startsWith('temp-') &&
                 m.sender.id === msg.sender.id &&
                 m.content === msg.content &&
                 isNear(m.createdAt, msg.createdAt)
        )
        const formatted: Message = {
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})
        }
        if (idx !== -1) { const next=[...prev]; next[idx]=formatted; return next }
        return [...prev, formatted]
      })

      setChatData((prev) => {
        const list = prev[id] || []
        const idx = list.findIndex(
          (m) => m.id.startsWith('temp-') &&
                 m.sender.id === msg.sender.id &&
                 m.content === msg.content &&
                 isNear(m.createdAt, msg.createdAt)
        )
        const formatted: Message = {
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})
        }
        const next = [...list]; if (idx !== -1) next[idx]=formatted; else next.push(formatted)
        return { ...prev, [id]: next }
      })

      setChatList((prev) => {
        if (!prev) return prev
        const updated = prev.map((c) =>
          c.chatId === id
            ? {
                ...c,
                latestMessage: msg.content,
                latestMessageAt: msg.createdAt,
                latestMessageSenderId: msg.sender.id,
                latestMessageAtDisplay: new Date(msg.createdAt).toLocaleString('ja-JP',{
                  month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
                }),
              }
            : c
        ).sort((a,b)=>{
          const ta = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0
          const tb = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0
          return tb - ta
        })
        return updated
      })
    }

    const handleNewMessage = (payload: { chatId: string; message: Message }) => {
      if (payload.chatId !== id) return
      upsertFromServer(payload.message)
    }

    socket.on('newMessage', handleNewMessage)
    return () => { socket.off('newMessage', handleNewMessage) }
  }, [id, setChatData, setChatList])

  // マッチ成立の購読（チャットルーム→newMatch、ユーザールーム→matchEstablished）
  useEffect(() => {
    if (!id || id.startsWith('dummy-')) return

    const applyMatch = (data: MatchPayload) => {
      if (data.chatId && data.chatId !== id) return

      setMatchMessage(data.message)
      setMatchMessageMatchedAt(data.matchedAt)
      setMatchHistory((prev) => {
        if (prev.some((m) => m.matchedAt === data.matchedAt && m.message === data.message)) return prev
        const next = [...prev, { message: data.message, matchedAt: data.matchedAt }]
        next.sort((a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime())
        return next
      })

      // リスト側も即時同期（ハイライト用途）
      setChatList((prev) => {
        if (!prev) return prev
        return prev.map((c) =>
          c.chatId === id
            ? {
                ...c,
                matchMessage: data.message,
                matchMessageMatchedAt: data.matchedAt,
                matchHistory: [
                  ...(c.matchHistory || []),
                  { message: data.message, matchedAt: data.matchedAt }
                ].sort((a,b)=>new Date(a.matchedAt).getTime()-new Date(b.matchedAt).getTime()),
              }
            : c
        )
      })
    }

    const onNewMatch = (data: MatchPayload) => applyMatch(data)
    const onMatchEstablished = (data: MatchPayload) => applyMatch(data)

    socket.on('newMatch', onNewMatch)               // チャットルーム経由
    socket.on('matchEstablished', onMatchEstablished) // ユーザールーム経由
    return () => {
      socket.off('newMatch', onNewMatch)
      socket.off('matchEstablished', onMatchEstablished)
    }
  }, [id, setChatList])

  // サーバからの初期取得
  useEffect(() => {
    if (!id || id.startsWith('dummy-')) return
    let aborted = false
    ;(async () => {
      try {
        const res = await axios.get<Message[]>(`/api/chat/${id}`)
        if (aborted) return
        const formatted = res.data.map((msg) => ({
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleString('ja-JP', {
            month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
          }),
        }))
        formatted.forEach((m) => seenIdsRef.current.add(m.id))
        setMessages(formatted)
        setChatData((prev) => ({ ...prev, [id]: formatted }))
      } catch (e) {
        console.error('🚨 メッセージ取得エラー:', e)
      }
    })()
    return () => { aborted = true }
  }, [id, setChatData])

  // 既読
  useEffect(() => {
    if (!id || id.startsWith('dummy-')) return
    const write = () => localStorage.setItem(`chat-last-read-${id}`, new Date().toISOString())
    write()
    const onVis = () => { if (document.visibilityState === 'visible') write() }
    document.addEventListener('visibilitychange', onVis)
    return () => { write(); document.removeEventListener('visibilitychange', onVis) }
  }, [id, messages.length])

  // 自動スクロール
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = mainRef.current.scrollHeight
  }, [messages])

  const handleSend = async () => {
    if (!id || id.startsWith('dummy-') || !newMessage.trim() || isSending) return
    const senderId = localStorage.getItem('userId')
    if (!senderId) { alert('ログインしてください'); return }

    setIsSending(true)
    const contentToSend = newMessage
    setNewMessage('')

    const temp: Message = {
      id: `temp-${Date.now()}`,
      sender: { id: senderId, name: '自分' },
      content: contentToSend,
      createdAt: new Date().toISOString(),
      formattedDate: new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }),
    }
    setMessages((prev) => [...prev, temp])
    setChatData((prev) => ({ ...prev, [id]: [...(prev[id] || []), temp] }))

    try {
      const res = await axios.post<Message>(`/api/chat/${id}`, { senderId, content: contentToSend })
      const saved = res.data
      if (seenIdsRef.current.has(saved.id)) { setIsSending(false); return }
      seenIdsRef.current.add(saved.id)

      const formatted: Message = {
        ...saved,
        formattedDate: new Date(saved.createdAt).toLocaleString('ja-JP', {
          month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
        }),
      }
      setMessages((prev) => {
        const idx = prev.findIndex(
          (m) => m.id.startsWith('temp-') &&
                 m.sender.id === senderId &&
                 m.content === contentToSend &&
                 isNear(m.createdAt, saved.createdAt)
        )
        if (idx !== -1) { const next=[...prev]; next[idx]=formatted; return next }
        return [...prev, formatted]
      })
      setChatData((prev) => {
        const list = prev[id] || []
        const idx = list.findIndex(
          (m) => m.id.startsWith('temp-') &&
                 m.sender.id === senderId &&
                 m.content === contentToSend &&
                 isNear(m.createdAt, saved.createdAt)
        )
        const next=[...list]; if (idx!==-1) next[idx]=formatted; else next.push(formatted)
        return { ...prev, [id]: next }
      })
    } catch (e) {
      console.error('🚨 送信エラー:', e)
    } finally {
      setIsSending(false)
    }
  }

  const headerName =
    chatInList?.matchedUser.name ||
    messages.find((m) => m.sender.id !== currentUserId)?.sender.name ||
    'チャット'
  const headerInitials = getInitials(headerName)
  const headerColor = getBgColor(headerName)

  function renderMessagesWithDate(msgs: Message[]) {
    const result: React.ReactElement[] = []
    let lastDate = ''
    const ensureDateBar = (iso: string) => {
      const key = new Date(iso).toISOString().slice(0, 10)
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

    let mi = 0
    for (const msg of msgs) {
      const msgTs = new Date(msg.createdAt).getTime()
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
      ensureDateBar(msg.createdAt)
      const isMe = msg.sender.id === currentUserId
      result.push(
        <div key={msg.id} className={`flex items-end ${isMe ? 'justify-end' : 'justify-start'} w-full`}>
          {!isMe && (
            <div
              className="w-9 h-9 rounded-full flex items-center justify中心 text-white font-bold text-base mr-2 shadow"
              style={{ backgroundColor: getBgColor(msg.sender.name) }}
            >
              {getInitials(msg.sender.name)}
            </div>
          )}
          <div className="flex flex-col items-end max-w-[70%]">
            <div
              className={`relative px-4 py-2 text-sm rounded-2xl shadow-md ${
                isMe ? 'bg-green-400 text-white rounded-br-md bubble-right'
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
      <header className="fixed top-0 left-0 right-0 z-10 bg-white px-4 py-3 flex items-center border-b">
        <button onClick={() => router.push('/chat-list')} className="mr-3 focus:outline-none">
          <Image src="/icons/back.png" alt="Back" width={24} height={24} />
        </button>
        <div className="flex flex-col">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mr-2 shadow" style={{ backgroundColor: headerColor }}>
              {headerInitials}
            </div>
            <span className="text-base font-bold text-black">{headerName}</span>
          </div>
          {!!matchMessage && (
            <span className="text-xs text-gray-500 mt-1">
              「{matchMessage}」
              {matchMessageMatchedAt
                ? ` / ${new Date(matchMessageMatchedAt).toLocaleString('ja-JP', {
                    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}`
                : ''}
            </span>
          )}
        </div>
      </header>

      <main ref={mainRef} className="flex-1 px-2 pt-20 overflow-y-auto overflow-x-hidden pb-32 scrollbar-hide">
        <div className="flex flex-col gap-1 py-2">{renderMessagesWithDate(messages)}</div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] flex items-center gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="メッセージを入力"
          className="flex-1 border border-gray-200 rounded-full px-4 py-2 focus:outline-none bg-gray-50 text-base"
        />
        <button
          onClick={handleSend}
          className="ml-2 p-2 rounded-full bg-green-400 hover:bg-green-500 transition shadow-lg"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
        >
          <Image src={newMessage.trim() ? '/icons/send.png' : '/icons/message.png'} alt="Send" width={28} height={28} />
        </button>
      </footer>

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