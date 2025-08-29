'use client'
import { useEffect } from 'react'

export default function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // デプロイごとに変える。何も設定してなければビルド時刻で代用。
    const ver = process.env.NEXT_PUBLIC_SW_VERSION || String(Date.now())
    const url = `/sw.js?v=${encodeURIComponent(ver)}`

    navigator.serviceWorker
      .register(url, { scope: '/' })
      .then((reg) => {
        // すぐ更新確認（Safari対策）
        reg.update().catch(() => {})
        const onVis = () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        }
        document.addEventListener('visibilitychange', onVis)

        // useEffect のクリーンアップでイベントリスナを外す
        return () => document.removeEventListener('visibilitychange', onVis)
      })
      .catch((err) => {
        console.error('[SW] register failed:', err)
      })
  }, [])

  return null
}