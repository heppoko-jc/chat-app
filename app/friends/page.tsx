// app/friends/page.tsx
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Image from "next/image";
import { useRouter } from "next/navigation";
import FixedTabBar from "../components/FixedTabBar";

interface User {
  id: string;
  name: string;
  bio: string;
}

interface Friend {
  id: string;
  friendId: string;
}

export default function FriendsPage() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processingUsers, setProcessingUsers] = useState<Set<string>>(
    new Set()
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // 戻るボタンの処理
  const handleBack = () => {
    if (isProcessing) {
      alert("ともだち設定を保存中です。");
      return;
    }
    router.back();
  };

  // ページ離脱時の警告
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = "ともだち設定を保存中です。";
        return "ともだち設定を保存中です。";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isProcessing]);

  // ともだち登録画面訪問時刻を記録
  useEffect(() => {
    const uid = localStorage.getItem("userId");
    if (uid) {
      const timestamp = new Date().toISOString();
      localStorage.setItem(`lastFriendsPageVisit-${uid}`, timestamp);
    }
  }, []);

  // 初期データ取得
  useEffect(() => {
    const uid = localStorage.getItem("userId");
    setCurrentUserId(uid);

    if (uid) {
      Promise.all([
        axios.get<User[]>("/api/users"),
        axios.get<Friend[]>("/api/friends", {
          headers: { userId: uid },
        }),
      ])
        .then(([usersRes, friendsRes]) => {
          setUsers(usersRes.data.filter((u) => u.id !== uid));
          setFriends(new Set(friendsRes.data.map((f) => f.friendId)));
          setLoading(false);
        })
        .catch((error) => {
          console.error("データ取得エラー:", error);
          setLoading(false);
        });
    }
  }, []);

  // ともだちタグの切り替え（楽観的更新 + ボタン無効化）
  const toggleFriend = async (userId: string) => {
    if (!currentUserId || processingUsers.has(userId)) return;

    const isCurrentlyFriend = friends.has(userId);

    // 1. 即座にUI更新（楽観的更新）
    if (isCurrentlyFriend) {
      setFriends((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    } else {
      setFriends((prev) => new Set([...prev, userId]));
    }

    // 2. 処理中フラグを設定
    setProcessingUsers((prev) => new Set([...prev, userId]));
    setIsProcessing(true);

    // 3. バックグラウンドでAPI呼び出し
    try {
      if (isCurrentlyFriend) {
        // ともだち解除
        await axios.delete(`/api/friends/${userId}`, {
          headers: { userId: currentUserId },
        });
      } else {
        // ともだち追加
        await axios.post(
          "/api/friends",
          { friendId: userId },
          { headers: { userId: currentUserId } }
        );
      }
    } catch (error) {
      // 4. エラー時のみロールバック
      console.error("ともだち設定エラー:", error);
      setFriends((prev) => {
        if (isCurrentlyFriend) {
          // 解除に失敗した場合、元に戻す
          return new Set([...prev, userId]);
        } else {
          // 追加に失敗した場合、元に戻す
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        }
      });
    } finally {
      // 5. 処理完了
      setProcessingUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="text-orange-500 text-lg">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-orange-50 overflow-hidden">
      {/* ヘッダー */}
      <div className="shrink-0 bg-white shadow-md px-6 py-4 border-b border-orange-100">
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="transition-transform duration-200 ease-out active:scale-125 focus:outline-none rounded-full p-2"
          >
            <Image
              src="/icons/back.png"
              alt="戻る"
              width={24}
              height={24}
              className="cursor-pointer"
            />
          </button>
          <h1 className="text-xl font-bold text-orange-500">ともだち登録</h1>
          <div className="w-10" />
        </div>
        <p className="text-sm text-gray-600 text-center mt-2">
          ここで選んだ人だけがともだちリストに表示されます
        </p>
        <p className="text-xs text-gray-500 text-center mt-1">
          相手には何も通知されません
        </p>
        <p className="text-xs text-orange-500 text-center mt-1 font-bold">
          ともだち: {friends.size}人
        </p>
      </div>

      {/* コンテンツ（スクロール可能） */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 p-4 rounded-2xl shadow-md border border-orange-200 bg-white"
            >
              {/* アバター */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow"
                style={{ backgroundColor: getBgColor(user.name) }}
              >
                {getInitials(user.name)}
              </div>

              {/* ユーザー情報 */}
              <div className="flex-1 min-w-0">
                <p className="text-lg text-gray-800 truncate">{user.name}</p>
                {user.bio && (
                  <p className="text-sm text-gray-600 truncate">{user.bio}</p>
                )}
              </div>

              {/* ともだちボタン */}
              <button
                onClick={() => toggleFriend(user.id)}
                disabled={processingUsers.has(user.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full transition-opacity ${
                  processingUsers.has(user.id)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
                style={{
                  backgroundColor: friends.has(user.id) ? "#f97316" : "#fbbf24",
                  color: "white",
                }}
              >
                {processingUsers.has(user.id) ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Image
                    src={
                      friends.has(user.id)
                        ? "/icons/add-friend.png"
                        : "/icons/add.png"
                    }
                    alt={friends.has(user.id) ? "ともだち解除" : "ともだち追加"}
                    width={20}
                    height={20}
                  />
                )}
                {processingUsers.has(user.id) ? (
                  <span className="text-sm font-bold">処理中...</span>
                ) : friends.has(user.id) ? (
                  <span className="text-sm font-bold">ともだち</span>
                ) : null}
              </button>
            </div>
          ))}
        </div>
      </div>

      <FixedTabBar />
    </div>
  );
}

// ヘルパー関数（メイン画面から移植）
function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getBgColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h = hash % 360;
  return `hsl(${h}, 70%, 80%)`;
}
