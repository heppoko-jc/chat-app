'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
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
  matchedUserId?: string
  targetUserId?: string
  matchedUserName?: string
  matchId?: string
}

/** visualViewport を安全に取得 */
function getVV(): VisualViewport | undefined {
  if (typeof window === 'undefined') return undefined
  return window.visualViewport ?? undefined
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

  // ===== レイアウト参照 =====
  const mainRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const footerRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)

  // visualViewport（iOS/Android 差吸収）
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [vvTop, setVvTop] = useState(0)
  const [shrinkMode, setShrinkMode] = useState(false) // iOS の shrink 検知
  const baseVvHeightRef = useRef<number | null>(null)
  const baseInnerHeightRef = useRef<number | null>(null)

  // ヘッダー/フッターの実測
  const [headerH, setHeaderH] = useState(64)
  const [footerH, setFooterH] = useState(56)

  // 受信済みID（broadcast重複防止）
  const seenIdsRef = useRef<Set<string>>(new Set())

  // ======= テキストエリア：自動リサイズ（最大3行）=======
  const autoResizeTextarea = useCallback(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const line = parseFloat(getComputedStyle(ta).lineHeight || '20')
    const padding =
      parseFloat(getComputedStyle(ta).paddingTop || '0') +
      parseFloat(getComputedStyle(ta).paddingBottom || '0')
    const maxH = line * 3 + padding
    const newH = Math.min(ta.scrollHeight, maxH)
    ta.style.maxHeight = `${maxH}px`
    ta.style.height = `${newH}px`
    ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden'
  }, [])

  // ======= マルチティックで最後尾を可視化（iOS遅延対策）=======
  const nudgeLastMessageVisible = useCallback(() => {
    const run = () => ensureLastMessageVisible()
    requestAnimationFrame(run)
    setTimeout(run, 50)
    setTimeout(run, 150)
  }, [])

  // ======= 最後のメッセージが隠れていれば可視化 =======
  const ensureLastMessageVisible = useCallback(() => {
    const main = mainRef.current
    const footer = footerRef.current
    if (!main) return

    const rows = main.querySelectorAll<HTMLElement>('[data-msg-row="1"]')
    const last = rows.length ? rows[rows.length - 1] : null
    if (!last) return

    const vv = getVV()
    const viewH = vv?.height ?? window.innerHeight
    const topOffset = vv?.offsetTop ?? 0
    const fH = (footer?.getBoundingClientRect().height ?? footerH)
    const effectiveKb = shrinkMode ? 0 : keyboardHeight

    // ← 重要：iOS は vvTop 分だけ可視領域が下にずれるので「vvTop + vv.height」をベースにする
    const bottomSafe = topOffset + viewH - (effectiveKb + fH + 12)

    const lastRect = last.getBoundingClientRect()
    const delta = lastRect.bottom - bottomSafe

    if (delta > 0) {
      main.scrollTop += delta
    }
  }, [keyboardHeight, shrinkMode, footerH])

  // 初期 seenID
  useEffect(() => {
    if (!id) return
    const set = seenIdsRef.current
    set.clear()
    ;(initialMessages ?? []).forEach((m) => set.add(m.id))
  }, [id, initialMessages])

  // ユーザー固有ルームへ join
  useEffect(() => {
    const uid = localStorage.getItem('userId')
    setCurrentUserId(uid)
    if (uid) socket.emit('setUserId', uid)
  }, [])

  // ダミーIDなら一覧へ戻す
  useEffect(() => {
    if (id?.startsWith('dummy-')) router.replace('/chat-list')
  }, [id, router])

  // 一覧からヘッダー/マッチ履歴を初期化
  const chatInList = chatList?.find((c) => c.chatId === id)
  useEffect(() => {
    if (!chatInList) return
    setMatchMessage(chatInList.matchMessage || '')
    setMatchMessageMatchedAt(chatInList.matchMessageMatchedAt || null)
    setMatchHistory(
      (chatInList.matchHistory || [])
        .slice()
        .sort((a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime())
    )
  }, [chatInList])

  // ===== ヘッダー・フッター高さの実測 =====
  useEffect(() => {
    const measure = () => {
      const h = headerRef.current?.getBoundingClientRect().height ?? 64
      const f = footerRef.current?.getBoundingClientRect().height ?? 56
      setHeaderH(Math.round(h))
      setFooterH(Math.round(f))
    }
    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    // 入力伸縮や keyboard 直後のぶれを吸収
    const t = window.setInterval(measure, 120)
    setTimeout(() => window.clearInterval(t), 2000)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(t)
    }
  }, [])

  // ===== ルーム参加 & 受信購読（newMessage） =====
  useEffect(() => {
    if (!id || id.startsWith('dummy-')) return
    socket.emit('joinChat', id)

    const upsertFromServer = (msg: Message) => {
      if (seenIdsRef.current.has(msg.id)) return
      seenIdsRef.current.add(msg.id)

      setMessages((prev) => {
        const idx = prev.findIndex(
          (m) =>
            m.id.startsWith('temp-') &&
            m.sender.id === msg.sender.id &&
            m.content === msg.content &&
            isNear(m.createdAt, msg.createdAt)
        )
        const next = [...prev]
        const formatted: Message = {
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        }
        if (idx !== -1) next[idx] = formatted
        else next.push(formatted)
        return next
      })

      setChatData((prev) => {
        const list = prev[id] || []
        const idx = list.findIndex(
          (m) =>
            m.id.startsWith('temp-') &&
            m.sender.id === msg.sender.id &&
            m.content === msg.content &&
            isNear(m.createdAt, msg.createdAt)
        )
        const formatted: Message = {
          ...msg,
          formattedDate: new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        }
        const next = [...list]
        if (idx !== -1) next[idx] = formatted
        else next.push(formatted)
        return { ...prev, [id]: next }
      })

      setChatList((prev) => {
        if (!prev) return prev
        const updated = prev
          .map((c) =>
            c.chatId === id
              ? {
                  ...c,
                  latestMessage: msg.content,
                  latestMessageAt: msg.createdAt,
                  latestMessageSenderId: msg.sender.id,
                  latestMessageAtDisplay: new Date(msg.createdAt).toLocaleString('ja-JP', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                }
              : c
          )
          .sort((a, b) => {
            const ta = a.latestMessageAt ? new Date(a.latestMessageAt).getTime() : 0
            const tb = b.latestMessageAt ? new Date(b.latestMessageAt).getTime() : 0
            return tb - ta
          })
        return updated
      })

      nudgeLastMessageVisible()
    }

    const handleNewMessage = (payload: { chatId: string; message: Message }) => {
      if (payload.chatId !== id) return
      upsertFromServer(payload.message)
    }

    socket.on('newMessage', handleNewMessage)
    return () => {
      socket.off('newMessage', handleNewMessage)
    }
  }, [id, setChatData, setChatList, nudgeLastMessageVisible])

  // ===== マッチ成立のリアルタイム反映 =====
  useEffect(() => {
    if (!id || id.startsWith('dummy-')) return

    const partnerId =
      chatList?.find((c) => {
        return c.chatId === id
      })?.matchedUser.id ||
      messages.find((m) => m.sender.id !== currentUserId)?.sender.id ||
      null

    const apply = (data: MatchPayload) => {
      if (data.chatId && data.chatId !== id) return
      if (!data.chatId && partnerId && data.matchedUserId && data.matchedUserId !== partnerId) return

      setMatchMessage(data.message)
      setMatchMessageMatchedAt(data.matchedAt)

      setMatchHistory((prev) => {
        if (prev.some((m) => m.matchedAt === data.matchedAt && m.message === data.message)) return prev
        const next = [...prev, { message: data.message, matchedAt: data.matchedAt }]
        next.sort((a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime())
        return next
      })

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
                  { message: data.message, matchedAt: data.matchedAt },
                ].sort((a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()),
              }
            : c
        )
      })

      nudgeLastMessageVisible()
    }

    const onMatchEstablished = (data: MatchPayload) => apply(data)
    socket.on('matchEstablished', onMatchEstablished)
    return () => {
      socket.off('matchEstablished', onMatchEstablished)
    }
  }, [id, chatList, messages, currentUserId, setChatList, nudgeLastMessageVisible])

  // ===== 初回＆id変化時はサーバから最新を取得 =====
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
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }))
        formatted.forEach((m) => seenIdsRef.current.add(m.id))
        setMessages(formatted)
        setChatData((prev) => ({ ...prev, [id]: formatted }))
        nudgeLastMessageVisible()
      } catch (e) {
        console.error('🚨 メッセージ取得エラー:', e)
      }
    })()
    return () => { aborted = true }
  }, [id, setChatData, nudgeLastMessageVisible])

  // ===== 既読書き込み =====
  useEffect(() => {
    if (!id || id.startsWith('dummy-')) return
    const write = () => localStorage.setItem(`chat-last-read-${id}`, new Date().toISOString())
    write()
    const onVis = () => { if (document.visibilityState === 'visible') write() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      write()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [id, messages.length])

  // メッセージ/キーボード変化時に必要なときだけ最下部に寄せる
  useEffect(() => {
    nudgeLastMessageVisible()
  }, [messages, keyboardHeight, shrinkMode, footerH, nudgeLastMessageVisible])

  // ===== visualViewport による OS 差吸収 =====
  const recomputeViewport = useCallback(() => {
    const vv = getVV()
    const layoutH = window.innerHeight
    const vvH = vv?.height ?? layoutH
    const top = vv?.offsetTop ?? 0

    if (baseVvHeightRef.current == null) baseVvHeightRef.current = vvH
    if (baseInnerHeightRef.current == null) baseInnerHeightRef.current = layoutH

    // keyboard 高さ推定（Android寄り / iOS寄り）
    const kb1 = Math.max(0, layoutH - (vvH + top))
    const kb2 = Math.max(0, (baseVvHeightRef.current ?? vvH) - vvH)
    const kb = Math.max(kb1, kb2)

    // shrink 判定
    const innerDelta = Math.max(0, (baseInnerHeightRef.current ?? layoutH) - layoutH)
    const isShrink = innerDelta > kb * 0.5

    setKeyboardHeight(kb)
    setVvTop(top)
    setShrinkMode(isShrink)

    // iOS の勝手スクロールを抑制
    if (window.scrollY !== 0) {
      window.scrollTo(0, 0)
    }

    nudgeLastMessageVisible()
  }, [nudgeLastMessageVisible])

  useEffect(() => {
    const vv = getVV()
    if (!vv) return
    const handler = () => recomputeViewport()

    vv.addEventListener('resize', handler)
    vv.addEventListener('scroll', handler)

    // Safari 16+ の geometrychange を使える場合は併用
    type VVEventTarget = { addEventListener?: (type: string, l: EventListener) => void; removeEventListener?: (type: string, l: EventListener) => void }
    const vvCompat = vv as unknown as VVEventTarget
    if (typeof vvCompat.addEventListener === 'function') {
      vvCompat.addEventListener('geometrychange', handler as EventListener)
    }

    handler()
    return () => {
      vv.removeEventListener('resize', handler)
      vv.removeEventListener('scroll', handler)
      if (typeof vvCompat.removeEventListener === 'function') {
        vvCompat.removeEventListener('geometrychange', handler as EventListener)
      }
    }
  }, [recomputeViewport])

  // テキスト変更時は自動リサイズ + 高さ変化後に再測定 & 再スクロール
  useEffect(() => {
    autoResizeTextarea()
    const f = footerRef.current?.getBoundingClientRect().height ?? footerH
    setFooterH(Math.round(f))
    nudgeLastMessageVisible()
  }, [newMessage, autoResizeTextarea, footerH, nudgeLastMessageVisible])

  // ====== ヘッダーの相手表示 ======
  const headerName =
    chatInList?.matchedUser.name ||
    messages.find((m) => m.sender.id !== currentUserId)?.sender.name ||
    'チャット'

  // ====== 送信 ======
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

    const temp: Message = {
      id: `temp-${Date.now()}`,
      sender: { id: senderId, name: '自分' },
      content: contentToSend,
      createdAt: new Date().toISOString(),
      formattedDate: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, temp])
    setChatData((prev) => ({ ...prev, [id]: [...(prev[id] || []), temp] }))

    try {
      const res = await axios.post<Message>(`/api/chat/${id}`, { senderId, content: contentToSend })
      const saved = res.data

      if (seenIdsRef.current.has(saved.id)) {
        setIsSending(false)
        setTimeout(() => inputRef.current?.focus(), 0)
        nudgeLastMessageVisible()
        return
      }

      seenIdsRef.current.add(saved.id)

      setMessages((prev) => {
        const idx = prev.findIndex(
          (m) =>
            m.id.startsWith('temp-') &&
            m.sender.id === senderId &&
            m.content === contentToSend &&
            isNear(m.createdAt, saved.createdAt)
        )
        const formatted: Message = {
          ...saved,
          formattedDate: new Date(saved.createdAt).toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = formatted
          return next
        }
        return [...prev, formatted]
      })

      setChatData((prev) => {
        const list = prev[id] || []
        const idx = list.findIndex(
          (m) =>
            m.id.startsWith('temp-') &&
            m.sender.id === senderId &&
            m.content === contentToSend &&
            isNear(m.createdAt, saved.createdAt)
        )
        const formatted: Message = {
          ...saved,
          formattedDate: new Date(saved.createdAt).toLocaleString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }
        const next = [...list]
        if (idx !== -1) next[idx] = formatted
        else next.push(formatted)
        return { ...prev, [id]: next }
      })
    } catch (e) {
      console.error('🚨 送信エラー:', e)
    } finally {
      setIsSending(false)
      // キーボードは閉じない＋直後に再補正
      setTimeout(() => {
        inputRef.current?.focus()
        autoResizeTextarea()
        nudgeLastMessageVisible()
      }, 0)
    }
  }

  // ====== タイムライン描画 ======
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
    const matches = (matchHistory || [])
      .slice()
      .sort((a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime())

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
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
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
        <div
          key={msg.id}
          data-msg-row="1"
          className={`flex items-end ${isMe ? 'justify-end' : 'justify-start'} w-full`}
        >
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
              style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
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
    // 画面全体を固定。ページのスクロールは無効（iOSの勝手スクロール防止）
    <div className="fixed inset-0 flex flex-col bg-[#f6f8fa] overflow-hidden">
      {/* ヘッダー：visual viewport 上端に追従 */}
      <header
        ref={headerRef}
        className="fixed left-0 right-0 z-10 bg-white px-4 py-3 flex items-center border-b will-change-transform"
        style={{ top: 0, transform: `translateY(${vvTop}px)` }}
      >
        <button onClick={() => router.push('/chat-list')} className="mr-3 focus:outline-none">
          <Image src="/icons/back.png" alt="Back" width={24} height={24} />
        </button>
        <div className="flex flex-col">
          <div className="flex items中心">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg mr-2 shadow"
              style={{ backgroundColor: getBgColor(headerName) }}
            >
              {getInitials(headerName)}
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
                    minute: '2-digit',
                  })}`
                : ''}
            </span>
          )}
        </div>
      </header>

      {/* メッセージ一覧：上はヘッダー + vvTop、下は footer + (iOS: vvTop / Android: keyboard) */}
      <main
        ref={mainRef}
        className="chat-main flex-1 px-2 overflow-y-auto overflow-x-hidden scrollbar-hide"
        style={{
          paddingTop: `${headerH + vvTop}px`,
          paddingBottom: `calc(${footerH}px + ${(shrinkMode ? vvTop : keyboardHeight)}px + env(safe-area-inset-bottom))`,
        }}
      >
        <div className="flex flex-col gap-1 py-2">{renderMessagesWithDate(messages)}</div>
      </main>

      {/* 入力欄：Android→keyboard 分だけ上げる / iOS→vvTop に追従 */}
      <footer
        ref={footerRef}
        className="fixed left-0 right-0 bg-white px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] flex items-center gap-3 will-change-transform"
        style={{
          bottom: `calc(env(safe-area-inset-bottom))`,
          transform: `translateY(${vvTop - (shrinkMode ? 0 : keyboardHeight)}px)`,
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onInput={autoResizeTextarea}
          onFocus={() => nudgeLastMessageVisible()}
          placeholder="メッセージを入力（改行可）"
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 focus:outline-none bg-gray-50 text-base shadow-sm resize-none leading-6"
          style={{ height: 'auto', overflowY: 'hidden' }}
        />
        <button
          onMouseDown={(e) => e.preventDefault()} // フォーカス保持＝キーボード閉じない
          onTouchStart={(e) => e.preventDefault()}
          onClick={handleSend}
          className="p-3 rounded-2xl bg-green-400 hover:bg-green-500 transition shadow-lg active:scale-95"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
          disabled={isSending || !newMessage.trim()}
          tabIndex={-1}
          aria-label="メッセージ送信"
        >
          <Image src={newMessage.trim() ? '/icons/send.png' : '/icons/message.png'} alt="Send" width={28} height={28} />
        </button>
      </footer>

      {/* 追加スタイル：scroll anchoring を無効化 */}
      <style jsx global>{`
        .chat-main { overflow-anchor: none; overscroll-behavior: contain; }
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