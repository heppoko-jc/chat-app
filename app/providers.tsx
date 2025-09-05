// app/providers.tsx

"use client";

import { ChatDataProvider } from "@/app/contexts/ChatDataContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ChatDataProvider>{children}</ChatDataProvider>;
}