// app/types/web-badging.d.ts
export {}

declare global {
  interface Navigator {
    serviceWorker?: ServiceWorkerContainer
    setAppBadge?: (contents?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }

  interface ServiceWorkerRegistration {
    setAppBadge?: (contents?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
}