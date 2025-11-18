// app/providers.tsx

"use client";

import { ChatDataProvider } from "@/app/contexts/ChatDataContext";
import { LanguageProvider } from "@/app/contexts/LanguageContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <ChatDataProvider>{children}</ChatDataProvider>
    </LanguageProvider>
  );
}