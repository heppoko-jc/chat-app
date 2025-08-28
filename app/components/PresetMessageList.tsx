
'use client'
import React, { useEffect, useState } from 'react'

type PresetMessage = {
  id: string
  content: string
  createdBy: string
  createdAt: string
}

export default function PresetMessageList() {
  const [messages, setMessages] = useState<PresetMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // 仮のユーザーID（本来はログイン情報から取得）
  const userId = 'sample-user-id'

  // 一覧取得
  useEffect(() => {
    fetch('/api/preset-message')
      .then((res) => res.json())
      .then((data) => {
        setMessages(data)
        setLoading(false)
      })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setSending(true)
    const res = await fetch('/api/preset-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input, createdBy: userId })
    })
    if (res.ok) {
      const newMsg = await res.json()
      setMessages((prev) => [newMsg, ...prev]) // 先頭に追加
      setInput('')
    } else {
      alert('作成に失敗しました')
    }
    setSending(false)
  }

  if (loading) return <div>読み込み中...</div>

  return (
    <div>
      <h2>プリセットメッセージ一覧</h2>
      <ul>
        {messages.map((msg) => (
          <li key={msg.id}>{msg.content}</li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="新しいメッセージを入力"
          disabled={sending}
          style={{ marginRight: 8 }}
        />
        <button type="submit" disabled={sending || !input.trim()}>
          {sending ? '送信中...' : '新規作成'}
        </button>
      </form>
    </div>
  )
}
