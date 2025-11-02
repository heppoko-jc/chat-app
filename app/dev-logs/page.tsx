"use client";

import { useEffect, useState } from "react";

export default function DevLogs() {
  const [items, setItems] = useState<
    Array<{ id: string; userId: string; startTime: string }>
  >([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      setErr("本番では利用できません");
      return;
    }
    fetch("/api/dev/sessions")
      .then((r) => r.json())
      .then((d) => setItems(d.sessions || []))
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="p-5">{err}</div>;

  return (
    <div className="p-5">
      <h1 className="text-lg font-bold mb-3">開発用: 直近のOPENログ</h1>
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id} className="text-sm">
            {s.userId} — {new Date(s.startTime).toLocaleString("ja-JP")}
          </li>
        ))}
      </ul>
    </div>
  );
}
