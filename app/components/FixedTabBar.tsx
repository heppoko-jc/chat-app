"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";

export default function FixedTabBar() {
  const router = useRouter();
  const pathname = usePathname();

  const mainIcon = pathname === "/main" ? "/icons/star.png" : "/icons/star blank.png";
  const chatIcon = pathname === "/chat-list" ? "/icons/chat.png" : "/icons/chat blank.png";
  const profileIcon = pathname === "/profile" ? "/icons/home.png" : "/icons/home blank.png";

  return (
    <div
      className="fixed left-0 right-0 bg-white flex justify-around items-center px-6 py-3 shadow-md z-40"
      // ↓ ここで 20px 浮かせる（iOSホームバー対応のため safe-area を足す）
      style={{ bottom: "calc(20px + env(safe-area-inset-bottom))" }}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          router.push("/main");
        }}
        className="transition-transform duration-200 ease-out active:scale-90 focus:outline-none"
      >
        <Image src={mainIcon} alt="Main" width={26} height={26} />
      </button>

      <button
        onClick={(e) => {
          e.preventDefault();
          router.push("/chat-list");
        }}
        className="transition-transform duration-200 ease-out active:scale-90 focus:outline-none"
      >
        <Image src={chatIcon} alt="Chat" width={26} height={26} />
      </button>

      <button
        onClick={(e) => {
          e.preventDefault();
          router.push("/profile");
        }}
        className="transition-transform duration-200 ease-out active:scale-90 focus:outline-none"
      >
        <Image src={profileIcon} alt="Profile" width={26} height={26} />
      </button>
    </div>
  );
}