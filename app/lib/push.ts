// app/lib/push.ts

export function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}

export async function subscribePush(): Promise<{
  success: boolean;
  error?: string;
  reason?: string;
}> {
  try {
    console.log("[Push] subscribePush() start");

    if (typeof window === "undefined") {
      return { success: false, reason: "server_side" };
    }

    if (!("serviceWorker" in navigator)) {
      console.log("[Push] serviceWorker not supported");
      return { success: false, reason: "no_service_worker" };
    }

    if (!("PushManager" in window)) {
      console.log("[Push] PushManager not supported");
      return { success: false, reason: "no_push_manager" };
    }

    // ← トークンが無いなら絶対に購読しない
    const token = localStorage.getItem("token");
    if (!token) {
      console.info("[Push] no JWT token; skip subscribe");
      return { success: false, reason: "no_token" };
    }

    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      console.warn("[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set; skip");
      return { success: false, reason: "no_vapid_key" };
    }

    const reg = await navigator.serviceWorker.ready;
    console.log("[Push] SW ready:", reg);

    // 通知許可を最初に確認
    if (Notification.permission === "denied") {
      console.info("[Push] notification permission denied");
      return { success: false, reason: "permission_denied" };
    }

    // 通知許可（granted 以外なら要求）
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.info("[Push] user denied notifications; skip");
        return {
          success: false,
          reason:
            permission === "denied"
              ? "permission_denied"
              : "permission_not_granted",
        };
      }
    }

    // 既に購読済みなら再利用（サーバへ送るのはこの後）
    const existing = await reg.pushManager.getSubscription();
    const subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      }));

    // サーバへ登録（ここで token を付与）
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[Push] subscribe API failed:", res.status, text);
      return {
        success: false,
        reason: "api_error",
        error: `API failed: ${res.status} ${text}`,
      };
    }

    console.log("[Push] subscribe API success");
    return { success: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("[Push] subscribePush error:", e);
    return {
      success: false,
      reason: "exception",
      error: errorMessage,
    };
  }
}

export async function unsubscribePush() {
  try {
    console.log("[Push] unsubscribePush() start");
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const token = localStorage.getItem("token");
    if (!token) {
      console.info("[Push] no JWT token; skip unsubscribe");
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      console.log("[Push] no existing subscription");
      return;
    }

    const res = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[Push] unsubscribe API failed:", res.status, text);
    } else {
      console.log("[Push] unsubscribe API success");
    }
  } catch (e) {
    console.error("[Push] unsubscribePush error:", e);
  }
}