// app/lib/badge.ts

// 最小限のナビゲータ型。Badging API と SW まわりだけを緩く定義
type BadgeCapableNavigator = Navigator & {
  serviceWorker?: {
    ready?: Promise<ServiceWorkerRegistration>
  }
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

// Service Worker Registration を安全に取得。無ければ null
export async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof navigator === 'undefined') return null
    const nav = navigator as unknown as BadgeCapableNavigator
    const ready = nav.serviceWorker?.ready
    if (!ready) return null
    const reg = await ready
    return reg ?? null
  } catch {
    return null
  }
}

// SW にメッセージ送信（存在すれば）
async function postToSW(msg: unknown) {
  try {
    const reg = await getSWRegistration()
    reg?.active?.postMessage(msg)
  } catch {
    // no-op
  }
}

// アイコンのバッジを未読合計で上書き
export async function syncBadgeCount(count: number) {
  const n = Math.max(0, count | 0)
  try {
    if (typeof navigator !== 'undefined') {
      const nav = navigator as unknown as BadgeCapableNavigator
      if (typeof nav.setAppBadge === 'function') {
        await nav.setAppBadge(n)
      } else {
        const reg = await getSWRegistration()
        await reg?.setAppBadge?.(n)
      }
    }
  } catch {
    // no-op
  }
  // SW 側の保持値も更新
  postToSW({ type: 'BADGE_SET', count: n })
}

// 既読分だけ減算
export async function decrementBadge(delta: number) {
  const d = Math.max(0, delta | 0)
  if (d === 0) return
  postToSW({ type: 'BADGE_DECREMENT', delta: d })
}