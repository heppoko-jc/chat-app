// app/components/FixedTabBar.tsx

'use client';

import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';

export default function FixedTabBar() {
  const router = useRouter();
  const pathname = usePathname();

  const mainIcon = pathname === '/main' ? '/icons/star.png' : '/icons/star blank.png';
  const chatIcon = pathname === '/chat-list' ? '/icons/chat.png' : '/icons/chat blank.png';
  const profileIcon = pathname === '/profile' ? '/icons/home.png' : '/icons/home blank.png';

  return (
    // 背景用の白いバーは「画面最下部」に固定
    <div className="fixed left-0 right-0 bottom-0 bg-white shadow-md z-40">
      {/* アイコン列だけを“持ち上げる”。見た目の位置は従来と同じ（20px + safe-area） */}
      <div
        className="flex justify-around items-center px-6 py-3"
        style={{ marginBottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            router.push('/main');
          }}
          className="transition-transform duration-200 ease-out active:scale-90 focus:outline-none"
          aria-label="Main"
        >
          <Image src={mainIcon} alt="Main" width={26} height={26} />
        </button>

        <button
          onClick={(e) => {
            e.preventDefault();
            router.push('/chat-list');
          }}
          className="transition-transform duration-200 ease-out active:scale-90 focus:outline-none"
          aria-label="Chat"
        >
          <Image src={chatIcon} alt="Chat" width={26} height={26} />
        </button>

        <button
          onClick={(e) => {
            e.preventDefault();
            router.push('/profile');
          }}
          className="transition-transform duration-200 ease-out active:scale-90 focus:outline-none"
          aria-label="Profile"
        >
          <Image src={profileIcon} alt="Profile" width={26} height={26} />
        </button>
      </div>
    </div>
  );
}