"use client";

import { useEffect, useRef } from "react";

export default function AppOpenLogger() {
  const sentOnceRef = useRef(false);

  useEffect(() => {
    const trySend = async () => {
      if (sentOnceRef.current) return;
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return;

      sentOnceRef.current = true;
      try {
        await fetch("/api/telemetry/open", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ at: Date.now() }),
          keepalive: true,
        });
      } catch {
        // swallow (minimal implementation). Optionally queue for retry.
      }
    };

    // first attempt immediately
    void trySend();

    const onVis = () => void trySend();
    const onShow = () => void trySend();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  return null;
}
