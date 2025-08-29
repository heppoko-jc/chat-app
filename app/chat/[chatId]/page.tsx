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

  // ログインユーザーID
  useEffect(() => {
    setCurrentUserId(localStorage.getItem('userId'))
  }, [])

  // ダミーIDで直接アクセスした場合は一覧へ戻す（通常は一覧→ensure→遷移なので発生しない想定）
  useEffect(() => {
    if (id?.startsWith('dummy-')) {
      router.replace('/chat-list')
    }
  }, [id, router])

  // Contextからマッチ情報など
  useEffect(() => {
    if (chatList && id) {
      const chat = chatList.find((c) => c.chatId === id)
      if (chat) {
        setMatchMessage(chat.matchMessage || '')
        setMatchMessageMatchedAt(chat.matchMessageMatchedAt || null)
        setMatchHistory(chat.matchHistory || [])
      }
    }
  }, [chatList, id])

  // 事前フェッチ済みがあればセット
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages)
    }
  }, [initialMessages])

  // 初期スクロール
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        if (mainRef.current) {
          mainRef.current.scrollTop = mainRef.current.scrollHeight
        }
      }, 100)
    }
  }, [messages.length])

  // APIから取得 & ソケット参加
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
        setMessages(formatted)
      } catch (e) {
        console.error('🚨 メッセージ取得エラー:', e)
      }
    })()

    socket.emit('joinChat', id)

    const handleNewMessage = (payload: { chatId: string; message: Message }) => {
      if (payload.chatId !== id) return
      const { message } = payload
      const formatted: Message = {
        ...message,
        formattedDate: new Date(message.createdAt).toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit'
        })
      }
      setMessages((prev) => [...prev, formatted])

      setChatData((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), formatted]
      }))

      if (chatList) {
        const updatedChatList = chatList.map((chat) => {
          if (chat.chatId === id) {
            return {
              ...chat,
              latestMessage: message.content,
              latestMessageAt: message.createdAt as unknown as string,
              latestMessageSenderId: message.sender.id,
              latestMessageAtDisplay: new Date(message.createdAt).toLocaleString('ja-JP', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          }
          return chat
        })
        updatedChatList.sort((a, b) => {
          const timeA = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0
          const timeB = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0
          return timeB - timeA
        })
        setChatList(updatedChatList)
      }
    }

    socket.on('newMessage', handleNewMessage)
    return () => {
      socket.off('newMessage', handleNewMessage)
    }
  }, [id, initialMessages, isPreloading, setChatData, chatList, setChatList])

  // メッセージ更新時にスクロール
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = mainRef.current.scrollHeight
    }
  }, [messages])

  // ★ チャット画面でもマッチ通知を反映
  useEffect(() => {
    const current = chatList?.find((c) => c.chatId === id)
    const partnerIdFromList = current?.matchedUser.id
    const partnerIdFromMsgs =
      messages.find((m) => m.sender.id !== currentUserId)?.sender.id

    const partnerId = partnerIdFromList || partnerIdFromMsgs
    if (!partnerId) return

    const handleMatchEstablished = (data: {
      matchId: string
      message: string
      matchedAt: string
      matchedUserId?: string
      matchedUserName?: string
      targetUserId?: string
    }) => {
      // 相手がこのチャットの相手なら反映
      if (data.matchedUserId === partnerId || data.targetUserId === partnerId) {
        setMatchMessage(data.message)
        setMatchMessageMatchedAt(data.matchedAt)
        setMatchHistory((prev) => [...prev, { message: data.message, matchedAt: data.matchedAt }])

        // chatList 側の表示も更新
        if (chatList) {
          const updated = chatList.map((c) =>
            c.chatId === id
              ? {
                  ...c,
                  matchMessage: data.message,
                  matchMessageMatchedAt: data.matchedAt,
                  matchHistory: [...(c.matchHistory || []), { message: data.message, matchedAt: data.matchedAt }],
                }
              : c
          )
          setChatList(updated)
        }
      }
    }

    socket.on('matchEstablished', handleMatchEstablished)
    return () => {
      socket.off('matchEstablished', handleMatchEstablished)
    }
  }, [chatList, id, messages, currentUserId, setChatList])

  // 送信
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

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      sender: { id: senderId, name: '自分' },
      content: contentToSend,
      createdAt: new Date().toISOString(),
      formattedDate: new Date().toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
      })
    }
    setMessages((prev) => [...prev, tempMessage])

    try {
      const res = await axios.post<Message>(`/api/chat/${id}`, {
        senderId,
        content: contentToSend
      })

      const updatedMessage: Message = {
        ...res.data,
        formattedDate: new Date(res.data.createdAt).toLocaleString('ja-JP', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      }

      setChatData((prev) => ({
        ...prev,
        [id]: [...(prev[id] || []), updatedMessage]
      }))

      if (chatList) {
        const updatedChatList = chatList.map((chat) => {
          if (chat.chatId === id) {
            return {
              ...chat,
              latestMessage: contentToSend,
              latestMessageAt: res.data.createdAt as unknown as string,
              latestMessageSenderId: senderId,
              latestMessageAtDisplay: new Date(res.data.createdAt).toLocaleString('ja-JP', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            }
          }
          return chat
        })
        updatedChatList.sort((a, b) => {
          const timeA = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0
          const timeB = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0
          return timeB - timeA
        })
        setChatList(updatedChatList)
      }

      // （必要なら）送信イベントも併用
      socket.emit('sendMessage', { chatId: id, message: res.data })
      inputRef.current?.focus()
    } catch (e) {
      console.error('🚨 送信エラー:', e)
    } finally {
      setIsSending(false)
    }
  }

  // ヘッダー表示用
  const partner = messages.find((m) => m.sender.id !== currentUserId)
  const partnerName = partner?.sender.name || 'チャット'
  const partnerColor = partner ? getBgColor(partner.sender.name) : '#ccc'
  const partnerInitials = partner ? getInitials(partner.sender.name) : ''

  // 日付区切り & マッチ表示
  function renderMessagesWithDate(msgs: Message[]) {
    let lastDate = ''
    const result: React.ReactElement[] = []
    let matchIdx = 0

    msgs.forEach((msg) => {
      const date = msg.createdAt.slice(0, 10)
      if (date !== lastDate) {
        result.push(
          <div key={`date-${date}`} className="flex justify-center my-2">
            <span className="bg-gray-200 text-gray-600 text-xs px-3 py-1 rounded-full shadow-sm">
              {date.replace(/-/g, '/')}
            </span>
          </div>
        )
        lastDate = date
      }

      while (
        matchHistory &&
        matchIdx < matchHistory.length &&
        new Date(msg.createdAt).getTime() > new Date(matchHistory[matchIdx].matchedAt).getTime()
      ) {
        result.push(
          <div key={`match-message-${matchHistory[matchIdx].matchedAt}`} className="flex justify-center my-2">
            <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
              マッチしたことば: 「{matchHistory[matchIdx].message}」
            </span>
          </div>
        )
        matchIdx++
      }

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
    })

    while (
      matchHistory &&
      matchIdx < matchHistory.length &&
      msgs.length > 0 &&
      new Date(msgs[msgs.length - 1].createdAt).getTime() < new Date(matchHistory[matchIdx].matchedAt).getTime()
    ) {
      result.push(
        <div key={`match-message-last-${matchHistory[matchIdx].matchedAt}`} className="flex justify-center my-2">
          <span className="bg-orange-100 text-orange-600 text-xs px-3 py-1 rounded-full shadow font-bold">
            マッチしたことば: 「{matchHistory[matchIdx].message}」
          </span>
        </div>
      )
      matchIdx++
    }

    return result
  }

  if (isPreloading && messages.length === 0) {
    return (
      <div className="flex flex-col bg白 h-screen">
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
              style={{ backgroundColor: partnerColor }}
            >
              {partnerInitials}
            </div>
            <span className="text-base font-bold text-black">{partnerName}</span>
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
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
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
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}