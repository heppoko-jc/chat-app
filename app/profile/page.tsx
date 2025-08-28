'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import FixedTabBar from '../components/FixedTabBar'
import { unsubscribePush } from '@/app/lib/push'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()
}

function getBgColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 60%)`
}

interface User {
  name: string
  email: string
  bio: string
}

export default function Profile() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [showSavedPopup, setShowSavedPopup] = useState(false)
  const [showLogoutPopup, setShowLogoutPopup] = useState(false)

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }
      try {
        const res = await axios.get('/api/auth/profile', {
          headers: { Authorization: `Bearer ${token}` }
        })
        setUser(res.data)
        setName(res.data.name)
        setBio(res.data.bio || '')
      } catch {
        // 期限切れ or 無効トークンならクリアしてログイン画面へ
        localStorage.removeItem('token')
        localStorage.removeItem('userId')
        router.push('/login')
      }
    }
    fetchUser()
  }, [router])

  const handleUpdateProfile = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      alert('ログインしてください')
      return
    }
    try {
      const res = await axios.put('/api/auth/profile', { name, bio }, { headers: { Authorization: `Bearer ${token}` } })
      setUser(res.data)
      setIsEditing(false)
      setShowSavedPopup(true)
      setTimeout(() => setShowSavedPopup(false), 3000)
    } catch {
      alert('プロフィールの更新に失敗しました')
    }
  }

  const handleLogout = async () => {
    try {
      // プッシュ購読解除
      await unsubscribePush()
    } catch (e) {
      console.error('プッシュ解除エラー:', e)
    }
    // ローカルストレージ・リダイレクト
    localStorage.removeItem('token')
    localStorage.removeItem('userId')
    router.push('/login')
  }

  if (!user) return <p className="p-5">Loading...</p>

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-orange-50 via-white to-orange-100">
      <div className="flex-1 overflow-y-auto pb-24 max-w-md mx-auto w-full px-4">
        <div className="flex flex-col items-center mt-8 mb-6">
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center text-white text-5xl font-extrabold shadow-lg border-4 border-white mb-3"
            style={{ backgroundColor: getBgColor(user.name) }}
          >
            {getInitials(user.name)}
          </div>
          <h2 className="text-2xl font-extrabold text-gray-800 mb-1 tracking-tight">{user.name}</h2>
          <p className="text-gray-500 text-sm mb-2">{user.email}</p>
        </div>
        {showSavedPopup && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-lg z-50 font-bold text-base animate-fade-in">
            変更を保存しました
          </div>
        )}
        <div className="bg-white/90 rounded-2xl shadow-xl p-6 mb-6 flex flex-col gap-4">
          {isEditing ? (
            <>
              <div>
                <label className="block mb-1 font-semibold text-gray-700">名前</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border border-orange-200 p-2 w-full rounded-lg focus:ring-2 focus:ring-orange-200 outline-none text-lg"
                />
              </div>
              <div>
                <label className="block mb-1 font-semibold text-gray-700">自己紹介</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="border border-orange-200 p-2 w-full h-24 rounded-lg focus:ring-2 focus:ring-orange-200 outline-none text-base"
                />
              </div>
              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={handleUpdateProfile}
                  className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-8 py-2 rounded-full shadow font-bold hover:from-orange-500 hover:to-orange-600 transition"
                >
                  保存
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="bg-gray-300 text-gray-700 px-8 py-2 rounded-full shadow font-bold hover:bg-gray-400 transition"
                >
                  キャンセル
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-700 text-base text-center min-h-[2.5rem]">{user.bio || '自己紹介未設定'}</p>
              <button
                onClick={() => setIsEditing(true)}
                className="bg-gradient-to-r from-orange-400 to-orange-500 text-white px-8 py-2 rounded-full shadow font-bold hover:from-orange-500 hover:to-orange-600 transition mt-2"
              >
                編集
              </button>
              <button
                onClick={() => setShowLogoutPopup(true)}
                className="bg-red-500 text-white px-8 py-2 rounded-full shadow font-bold hover:bg-red-600 transition mt-1"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
        {showLogoutPopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-11/12 max-w-sm">
              <h3 className="text-lg font-bold mb-2 text-center">ログアウト確認</h3>
              <p className="mb-4 text-center text-gray-700">本当にログアウトしますか？</p>
              <div className="flex justify-center gap-3 mt-2">
                <button
                  onClick={handleLogout}
                  className="bg-red-500 text-white px-8 py-2 rounded-full shadow font-bold hover:bg-red-600 transition"
                >
                  ログアウト
                </button>
                <button
                  onClick={() => setShowLogoutPopup(false)}
                  className="bg-gray-300 text-gray-700 px-8 py-2 rounded-full shadow font-bold hover:bg-gray-400 transition"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <FixedTabBar />
    </div>
  )
}
