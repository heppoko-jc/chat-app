// app/main/page.tsx
'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import Image from 'next/image'
import FixedTabBar from '../components/FixedTabBar'
import { useRouter } from 'next/navigation'
import { useChatData, PresetMessage } from '../contexts/ChatDataContext'
import MatchNotification from '../components/MatchNotification'
import socket from '../socket'
import type { ChatItem } from '../chat-list/page' // ← 追加: 型を使って any を排除

interface User {
  id: string
  name: string
  bio: string
}

// /api/chat-list のレスポンス用に生の latestMessageAt を許容
type ChatListApiItem = Omit<ChatItem, 'latestMessageAtDisplay' | 'latestMessageAtRaw'> & {
  latestMessageAt: string | null
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
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

export default function Main() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([])
  const [isSent, setIsSent] = useState(false)
  const [matchCount, setMatchCount] = useState<number>(0)
  const [step, setStep] = useState<'select-message' | 'select-recipients'>('select-message')
  const [sentMessageInfo, setSentMessageInfo] = useState<{ message: string; recipients: string[] } | null>(null)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const router = useRouter()
  const [isInputMode, setIsInputMode] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const { presetMessages, setPresetMessages, setChatList } = useChatData()
  const [isSending, setIsSending] = useState(false)

  // マッチ通知
  const [showMatchNotification, setShowMatchNotification] = useState(false)
  const [matchNotificationData, setMatchNotificationData] = useState<{
    matchedUser: { id: string; name: string }
    message: string
  } | null>(null)

  // 受信件数
  useEffect(() => {
    const uid = localStorage.getItem('userId')
    if (!uid) return
    axios
      .get<{ count: number }>('/api/match-message/count', { headers: { userId: uid } })
      .then((res) => setMatchCount(res.data.count))
      .catch((e) => console.error('件数取得エラー:', e))
  }, [])

  // 自分のID
  useEffect(() => {
    setCurrentUserId(localStorage.getItem('userId'))
    setSelectedMessage(null)
    setSelectedRecipientIds([])
  }, [])

  // ユーザー一覧
  useEffect(() => {
    axios
      .get<User[]>('/api/users')
      .then((res) => setUsers(res.data))
      .catch((e) => console.error('ユーザー取得エラー:', e))
  }, [])

  // WebSocket: マッチ通知
  useEffect(() => {
    if (!currentUserId) return

    socket.emit('setUserId', currentUserId)

    const handleMatchEstablished = (data: {
      matchId: string
      message: string
      matchedAt: string
      matchedUserId?: string
      matchedUserName?: string
      targetUserId?: string
    }) => {
      // 自分宛てのみ
      if (data.targetUserId && data.targetUserId !== currentUserId) return

      if (data.matchedUserId && data.matchedUserName) {
        setMatchNotificationData({
          matchedUser: { id: data.matchedUserId, name: data.matchedUserName },
          message: data.message,
        })
        setShowMatchNotification(true)

        // チャットリストを再取得（any 排除）
        const updateChatList = async () => {
          try {
            const chatListResponse = await axios.get<ChatListApiItem[]>('/api/chat-list', {
              headers: { userId: currentUserId },
            })
            const formattedChatList: ChatItem[] = chatListResponse.data
              .map((c): ChatItem => ({
                ...c,
                latestMessageAtRaw: c.latestMessageAt ?? '',
                latestMessageAt: c.latestMessageAt
                  ? new Date(c.latestMessageAt).toLocaleString('ja-JP', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '',
              }))
              .sort((a, b) => {
                const ta = a.latestMessageAtRaw ? new Date(a.latestMessageAtRaw).getTime() : 0
                const tb = b.latestMessageAtRaw ? new Date(b.latestMessageAtRaw).getTime() : 0
                return tb - ta
              })
            setChatList(formattedChatList)
          } catch (error) {
            console.error('WebSocket通知時のチャットリスト更新エラー:', error)
          }
        }
        updateChatList()
      }
    }

    socket.on('matchEstablished', handleMatchEstablished)
    return () => {
      socket.off('matchEstablished', handleMatchEstablished)
    }
  }, [currentUserId, setChatList])

  // スワイプ切替
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX)
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX
    const SWIPE_THRESHOLD = 100
    if (deltaX < -SWIPE_THRESHOLD && step === 'select-message') setStep('select-recipients')
    else if (deltaX > SWIPE_THRESHOLD && step === 'select-recipients') setStep('select-message')
    setTouchStartX(null)
  }

  const handleHistoryNavigation = () => {
    router.push('/notifications')
  }

  const handleSelectMessage = (msg: string) => {
    setSelectedMessage((prev) => (prev === msg ? null : msg))
    setInputMessage('')
  }

  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // メッセージ選択肢（カウント>0 のみ）
  const messageOptions = presetMessages.filter((msg) => msg.count > 0)

  // 待機バーの右ボタン
  const handleMessageIconClick = () => {
    if (isInputMode && inputMessage.trim()) {
      setSelectedMessage(inputMessage.trim())
      setIsInputMode(false)
      setStep('select-recipients')
    } else if (selectedMessage) {
      setStep('select-recipients')
    }
  }

  // 送信
  const handleSend = async () => {
    if (!selectedMessage || selectedRecipientIds.length === 0 || !currentUserId || isSending) return
    setIsSending(true)

    // 先にトースト表示
    setSentMessageInfo({ message: selectedMessage, recipients: [...selectedRecipientIds] })
    setIsSent(true)

    const messageToSend = selectedMessage
    const recipientsToSend = [...selectedRecipientIds]

    // UI リセット
    setSelectedMessage(null)
    setSelectedRecipientIds([])
    setStep('select-message')
    setIsInputMode(false)
    setInputMessage('')

    try {
      // プリセットのカウント更新 or 追加
      const isPreset = presetMessages.some((m) => m.content === messageToSend && m.count > 0)
      if (!isPreset) {
        const res = await fetch('/api/preset-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: messageToSend, createdBy: currentUserId }),
        })
        if (res.ok) {
          const created: PresetMessage = await res.json()
          setPresetMessages((prev) => [
            {
              id: created.id,
              content: created.content,
              createdBy: created.createdBy,
              createdAt: created.createdAt,
              count: created.count ?? 1,
            },
            ...prev,
          ])
        } else {
          alert('ことばの登録に失敗しました')
          setIsSending(false)
          setIsSent(false)
          setSentMessageInfo(null)
          return
        }
      } else {
        setPresetMessages((prev) => prev.map((m) => (m.content === messageToSend ? { ...m, count: m.count + 1 } : m)))
      }

      // マッチ API
      const matchResponse = await axios.post('/api/match-message', {
        senderId: currentUserId,
        receiverIds: recipientsToSend,
        message: messageToSend,
      })

      // マッチ成立時はチャットリストを更新（any 排除）
      if (matchResponse.data.message === 'Match created!') {
        const chatListResponse = await axios.get<ChatListApiItem[]>('/api/chat-list', {
          headers: { userId: currentUserId },
        })
        const formattedChatList: ChatItem[] = chatListResponse.data
          .map((c): ChatItem => ({
            ...c,
            latestMessageAtRaw: c.latestMessageAt ?? '',
            latestMessageAt: c.latestMessageAt
              ? new Date(c.latestMessageAt).toLocaleString('ja-JP', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '',
          }))
          .sort((a, b) => {
            const ta = a.latestMessageAtRaw ? new Date(a.latestMessageAtRaw).getTime() : 0
            const tb = b.latestMessageAtRaw ? new Date(b.latestMessageAtRaw).getTime() : 0
            return tb - ta
          })
        setChatList(formattedChatList)

        // 画面内ポップアップも表示（相手特定できれば）
        const matchedUserId = recipientsToSend.find((id) => matchResponse.data.matchedUserId === id)
        if (matchedUserId) {
          const matchedUser = users.find((u) => u.id === matchedUserId)
          if (matchedUser) {
            setMatchNotificationData({ matchedUser: { id: matchedUser.id, name: matchedUser.name }, message: messageToSend })
            setShowMatchNotification(true)
          }
        }
      }

      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
      setTimeout(() => {
        setIsSent(false)
        setSentMessageInfo(null)
      }, 4000)
    } catch (error) {
      console.error('送信エラー:', error)
      alert('メッセージの送信に失敗しました')
      setIsSent(false)
      setSentMessageInfo(null)
    } finally {
      setIsSending(false)
    }
  }

  const canSend = !!selectedMessage && selectedRecipientIds.length > 0

  return (
    <>
      {/* ヘッダー */}
      <div
        className="fixed top-0 left-0 w-full bg-gradient-to-b from-white via-orange-50 to-orange-100 z-20 px-6 pt-6 pb-3 flex flex-col items-center shadow-md rounded-b-3xl h-[100px]"
        style={{ minHeight: 100 }}
      >
        <div className="flex w-full justify-between items-center mb-2">
          <div className="w-20 flex items-center">
            <button
              onClick={handleHistoryNavigation}
              className="transition-transform duration-200 ease-out active:scale-125 focus:outline-none rounded-full p-2"
            >
              <Image src="/icons/history.png" alt="Notifications" width={28} height={28} className="cursor-pointer" />
            </button>
          </div>
          <h1 className="text-xl font-extrabold text-orange-500 tracking-tight drop-shadow-sm whitespace-nowrap" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Happy Ice Cream
          </h1>
          <div className="w-20" />
        </div>
        <p className="text-[15px] text-gray-700 text-center leading-snug mt-1 font-medium">
          <span className="bg-orange-100 px-2 py-0.5 rounded-xl">同じことばをシェアし合えるかな？</span>
          <span className="text-orange-500 font-bold">{matchCount}</span> 件受信済
        </p>
      </div>

      {/* 送信待機バー */}
      <div
        className={`fixed top-[100px] left-6 right-6 z-30 py-2 flex items-center h-16 px-3 shadow-lg rounded-2xl border border-orange-200 transition-all duration-200
          ${
            selectedMessage && selectedRecipientIds.length > 0
              ? 'bg-gradient-to-r from-orange-400 to-orange-300'
              : selectedMessage || selectedRecipientIds.length > 0
                ? 'bg-gradient-to-r from-orange-200 to-orange-100'
                : 'bg-orange-50'
          }
        `}
      >
        <div className="flex-1 flex flex-col justify-between h-full overflow-x-auto pr-2">
          {!selectedMessage || !messageOptions.some((m) => m.content === selectedMessage) ? (
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Aa..."
              className="flex-1 px-3 py-2 rounded-xl border border-orange-200 text-base bg-white shadow-sm focus:ring-2 focus:ring-orange-200 outline-none transition"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputMessage.trim()) {
                  setSelectedMessage(inputMessage.trim())
                  setIsInputMode(false)
                  setStep('select-recipients')
                }
              }}
              onBlur={() => {
                if (inputMessage.trim()) {
                  setSelectedMessage(inputMessage.trim())
                  setIsInputMode(false)
                  setStep('select-recipients')
                }
              }}
            />
          ) : (
            <span
              onClick={() => {
                setSelectedMessage(null)
              }}
              className="px-3 py-2 rounded-xl font-bold cursor-pointer bg-white/80 text-orange-600 shadow border border-orange-200 hover:bg-orange-100 transition"
            >
              {selectedMessage}
            </span>
          )}
          <div className="flex overflow-x-auto whitespace-nowrap scrollbar-hide mt-1">
            {selectedRecipientIds.length > 0 ? (
              selectedRecipientIds.map((id, idx) => {
                const u = users.find((u) => u.id === id)
                return (
                  <span
                    key={id}
                    onClick={() => toggleRecipient(id)}
                    className="inline-block mr-1 font-bold text-orange-700 bg-orange-100 px-2 py-1 rounded-xl shadow cursor-pointer hover:bg-orange-200 transition"
                  >
                    {u?.name}
                    {idx < selectedRecipientIds.length - 1 ? ',' : ''}
                  </span>
                )
              })
            ) : (
              <span className="text-orange-300">誰に送る？</span>
            )}
          </div>
        </div>

        {selectedRecipientIds.length > 0 && (
          <span className="ml-2 px-2 py-1 rounded-full bg-orange-400 text-white text-xs font-bold shadow border border-orange-200 select-none">
            {selectedRecipientIds.length}人
          </span>
        )}

        <button
          onClick={canSend ? handleSend : handleMessageIconClick}
          className="flex-none px-1 py-1 transition-transform duration-200 ease-out active:scale-125 focus:outline-none rounded-full bg-white/80 hover:bg-orange-100 shadow border border-orange-200"
          disabled={!canSend || isSending}
          style={{ minWidth: 36, minHeight: 36 }}
        >
          <Image src={canSend ? '/icons/send.png' : '/icons/message.png'} alt="send" width={28} height={28} />
        </button>
      </div>

      {/* コンテンツ */}
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden bg-orange-50"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-450"
          style={{ transform: step === 'select-message' ? 'translateX(0%)' : 'translateX(-100%)' }}
        >
          {/* メッセージ選択 */}
          <div className="min-w-full flex-shrink-0 text-lg overflow-y-auto px-5 pt-[180px] pb-[40px]" style={{ maxHeight: 'calc(100vh - 140px)' }}>
            <div className="flex flex-col gap-3">
              {messageOptions.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleSelectMessage(msg.content)}
                  className={`w-full flex justify-between items-center text-left px-5 py-3 rounded-3xl shadow-md border border-orange-100 hover:bg-orange-100 active:scale-95 font-medium text-base ${
                    selectedMessage === msg.content ? 'font-bold text-orange-700 bg-orange-200 border-orange-300 shadow-lg' : 'text-gray-700 bg-white'
                  }`}
                  style={{
                    backgroundColor: selectedMessage === msg.content ? '#fed7aa' : '#ffffff',
                    borderColor: selectedMessage === msg.content ? '#ea580c' : '#fed7aa',
                  }}
                >
                  <span>{msg.content}</span>
                  <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">{msg.count}回シェアされました</span>
                </button>
              ))}
            </div>
          </div>

          {/* 送信先選択 */}
          <div className="min-w-full flex-shrink-0 text-lg overflow-y-auto px-5 pt-[180px] pb-[40px]" style={{ maxHeight: 'calc(100vh - 140px)' }}>
            <div className="flex flex-col gap-2">
              {users
                .filter((u) => u.id !== currentUserId)
                .map((u) => (
                  <div
                    key={u.id}
                    onClick={() => toggleRecipient(u.id)}
                    className={`flex items-center gap-3 p-3 rounded-3xl shadow-md border border-orange-100 hover:bg-orange-100 active:scale-95 cursor-pointer ${
                      selectedRecipientIds.includes(u.id) ? 'bg-orange-200 border-orange-300 shadow-lg' : 'bg-white'
                    }`}
                    style={{
                      backgroundColor: selectedRecipientIds.includes(u.id) ? '#fed7aa' : '#ffffff',
                      borderColor: selectedRecipientIds.includes(u.id) ? '#ea580c' : '#fed7aa',
                    }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow" style={{ backgroundColor: getBgColor(u.name) }}>
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-lg truncate ${selectedRecipientIds.includes(u.id) ? 'font-bold text-orange-700' : 'text-gray-700'}`}>{u.name}</p>
                    </div>
                    {selectedRecipientIds.includes(u.id) && <Image src="/icons/check.png" alt="Selected" width={20} height={20} />}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </main>

      {/* リスト切替トグル */}
      <div className="fixed bottom-[56px] left-8 right-8 z-30 bg-white py-2 px-4 rounded-3xl shadow-lg border border-orange-200">
        <div className="relative flex">
          <span
            className="absolute top-0 bottom-0 w-1/2 bg-orange-100 rounded-3xl transition-transform duration-400"
            style={{ transform: step === 'select-message' ? 'translateX(0%)' : 'translateX(100%)' }}
          />
          <button onClick={() => setStep('select-message')} className={`relative z-10 flex-1 py-2 text-center text-base font-bold rounded-3xl transition text-orange-600 ${step === 'select-message' ? 'bg-orange-200 shadow' : ''}`}>
            ことばリスト
          </button>
          <button onClick={() => setStep('select-recipients')} className={`relative z-10 flex-1 py-2 text-center text-base font-bold rounded-3xl transition text-orange-600 ${step === 'select-recipients' ? 'bg-orange-200 shadow' : ''}`}>
            ともだちリスト
          </button>
        </div>
      </div>

      {/* 送信成功メッセージ */}
      {isSent && sentMessageInfo && (
        <div className="fixed top-[50px] left-0 right-0 z-30 overflow-hidden px-2 neon-gradient">
          <div className="w-max whitespace-nowrap animate-slide-in font-bold text-white text-lg px-4 py-2 shadow-lg">
            「{sentMessageInfo.message}」が
            {sentMessageInfo.recipients
              .map((id) => users.find((u) => u.id === id)?.name)
              .filter(Boolean)
              .join(', ')}
            にシェアされました！
          </div>
        </div>
      )}

      {/* マッチ通知 */}
      <MatchNotification
        isVisible={showMatchNotification}
        onClose={() => {
          setShowMatchNotification(false)
          setMatchNotificationData(null)
        }}
        matchedUser={matchNotificationData?.matchedUser}
        message={matchNotificationData?.message}
      />

      {/* 下部タブバー */}
      <FixedTabBar />
    </>
  )
}