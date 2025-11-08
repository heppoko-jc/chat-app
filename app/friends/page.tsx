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
  nameEn?: string | null;
  nameJa?: string | null;
  nameOther?: string | null;
  bio: string;
  createdAt: string;
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
  const [initialFriends, setInitialFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processingUsers, setProcessingUsers] = useState<Set<string>>(
    new Set()
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [warningType, setWarningType] = useState<
    "min_friends" | "daily_limit" | "time_remaining" | "locked" | null
  >(null);
  const [remainingTime, setRemainingTime] = useState<string>("");
  const [isRestricted, setIsRestricted] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ページ滞在中の表示順序を固定するための状態
  const [displayUsers, setDisplayUsers] = useState<User[]>([]);

  // カタカナをひらがなに変換する関数（検索用）
  const katakanaToHiragana = (str: string): string => {
    return str.replace(/[\u30A1-\u30F6]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
  };

  // 検索用の正規化関数（ひらがな/カタカナを統一、大文字小文字を統一）
  const normalizeForSearch = (str: string): string => {
    if (!str) return "";
    // ひらがなに統一
    let normalized = katakanaToHiragana(str);
    // 小文字に統一
    normalized = normalized.toLowerCase();
    return normalized;
  };

  // 検索フィルタリング関数
  const getFilteredUsers = (users: User[], query: string): User[] => {
    if (!query.trim()) return users;

    const normalizedQuery = normalizeForSearch(query);

    return users.filter((user) => {
      // 検索対象のフィールドを取得
      const searchableFields = [
        user.name,
        user.nameEn,
        user.nameJa,
        user.nameOther,
      ].filter(Boolean) as string[];

      // 各フィールドで部分一致チェック
      return searchableFields.some((field) => {
        const normalizedField = normalizeForSearch(field);
        return normalizedField.includes(normalizedQuery);
      });
    });
  };

  // 初期表示時のみのソート関数
  const createSortedUsersList = (
    usersList: User[],
    friendsSet: Set<string>
  ) => {
    return usersList.slice().sort((a, b) => {
      const aIsFriend = friendsSet.has(a.id);
      const bIsFriend = friendsSet.has(b.id);

      // フォロー中の人が上に来る
      if (aIsFriend && !bIsFriend) return -1;
      if (!aIsFriend && bIsFriend) return 1;

      // 同じフォロー状態の場合、登録が新しい順（createdAt降順）
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  // 変更の検出
  const hasChanges = () => {
    return !setsEqual(friends, initialFriends);
  };

  // 新規ユーザーが追加されたかチェック
  const hasNewUserAdded = () => {
    for (const friendId of friends) {
      if (!initialFriends.has(friendId) && isNewUser(friendId)) {
        return true;
      }
    }
    return false;
  };

  // ユーザーが削除されたかチェック
  const hasUserRemoved = () => {
    for (const friendId of initialFriends) {
      if (!friends.has(friendId)) {
        return true;
      }
    }
    return false;
  };

  // 新規ユーザーかどうかチェック（2日以内）
  const isNewUser = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user || !user.createdAt) return false;
    const userCreatedAt = new Date(user.createdAt);
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    return userCreatedAt >= twoDaysAgo;
  };

  // セットの等価性チェック
  const setsEqual = (set1: Set<string>, set2: Set<string>) => {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
      if (!set2.has(item)) return false;
    }
    return true;
  };

  // 制限状態をチェック
  const checkRestrictionStatus = async () => {
    if (!currentUserId) return { canChange: true, remainingTime: null };

    try {
      const response = await axios.get("/api/friends/restriction", {
        headers: { userId: currentUserId },
      });
      return response.data;
    } catch (error) {
      console.error("制限状態チェックエラー:", error);
      // エラー時は制限を適用しない（安全側に倒す）
      return { canChange: true, remainingTime: null };
    }
  };

  // 制限を記録
  const recordChange = async () => {
    if (!currentUserId) return;
    try {
      await axios.post(
        "/api/friends/restriction",
        {},
        {
          headers: { userId: currentUserId },
        }
      );
    } catch (error) {
      console.error("制限状態更新エラー:", error);
    }
  };

  // 戻るボタンの処理
  const handleBack = async () => {
    if (isProcessing) {
      alert("ともだち設定を保存中です。");
      return;
    }

    // ①2人以上登録のチェック（最優先）
    if (friends.size < 2) {
      setWarningType("min_friends");
      setShowWarning(true);
      return;
    }

    // ②変更があった場合のチェック
    if (hasChanges()) {
      // 新規ユーザー追加のみの場合は制限に関係なく特別扱い
      if (hasNewUserAdded() && !hasUserRemoved()) {
        // 新規ユーザー追加のみの場合は警告なし、記録なしで戻る
        router.back();
        return;
      }

      const { canChange, remainingTime } = await checkRestrictionStatus();

      if (!canChange) {
        setWarningType("time_remaining");
        setRemainingTime(remainingTime || "");
        setShowWarning(true);
        return;
      }

      // その他の変更の場合は警告を表示
      setWarningType("daily_limit");
      setShowWarning(true);
      return;
    }

    // 変更がない場合はそのまま戻る
    router.back();
  };

  // 警告ポップアップの処理
  const handleWarningClose = () => {
    setShowWarning(false);
    setWarningType(null);

    // 制限中の場合は元の設定に戻す
    if (isRestricted) {
      setFriends(new Set(initialFriends));
    }
  };

  const handleConfirmBack = () => {
    // 変更を記録（楽観的更新）
    recordChange().catch(console.error);
    setShowWarning(false);
    setWarningType(null);
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
        // 制限状態もチェック
        axios.get("/api/friends/restriction", {
          headers: { userId: uid },
        }),
      ])
        .then(([usersRes, friendsRes, restrictionRes]) => {
          const filteredUsers = usersRes.data.filter((u) => u.id !== uid);
          setUsers(filteredUsers);
          const friendsSet = new Set(friendsRes.data.map((f) => f.friendId));
          setFriends(friendsSet);
          setInitialFriends(new Set(friendsSet));

          // 初期表示順序を設定（ページ滞在中はこの順序を維持）
          const sortedUsers = createSortedUsersList(filteredUsers, friendsSet);
          setDisplayUsers(sortedUsers);

          // 制限状態をチェック
          const { canChange, remainingTime } = restrictionRes.data;
          if (!canChange) {
            setIsRestricted(true);
            setRemainingTime(remainingTime || "");
          }

          setLoading(false);

          // 情報ポップアップを表示（ユーザーが表示しないと選択していない場合のみ）
          const shouldShowInfo = !localStorage.getItem(
            `hideFollowInfoPopup-${uid}`
          );
          if (shouldShowInfo) {
            setShowInfoPopup(true);
          }
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

    // 制限中の場合は新規ユーザー追加以外を制限
    if (isRestricted) {
      const isCurrentlyFriend = friends.has(userId);
      const isNewUserToday = isNewUser(userId);

      // 新規ユーザーを追加する場合は許可
      if (!isCurrentlyFriend && isNewUserToday) {
        // 新規ユーザー追加は許可
      } else {
        // その他の変更は制限
        const restrictionStatus = await checkRestrictionStatus();
        setRemainingTime(restrictionStatus.remainingTime || "");
        setWarningType("locked");
        setShowWarning(true);
        return;
      }
    }

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
      <div className="shrink-0 bg-white px-6 py-4 border-b border-orange-100">
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
          <h1 className="text-xl font-bold text-orange-500">フォローする</h1>
          <div className="w-10" />
        </div>
        <p className="text-sm text-gray-600 text-center mt-2">
          ここで選んだ人とマッチします。
        </p>
        <p className="text-xs text-red-600 text-center mt-1 font-bold">
          相手には何も通知されません。
        </p>
        {!isRestricted && (
          <p className="text-xs text-gray-500 text-center mt-1">
            一度設定を変更すると1時間ロックされます。
          </p>
        )}
        {isRestricted ? (
          <p className="text-xs text-orange-500 text-center mt-1 font-bold">
            フォロー: {friends.size}人
          </p>
        ) : (
          <p className="text-xs text-orange-500 text-center mt-1 font-bold">
            フォロー: {friends.size}人
          </p>
        )}

        {/* 検索バー */}
        <div className="mt-3 relative">
          <input
            type="text"
            placeholder="名前で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pr-10 border border-orange-200 rounded-full focus:ring-2 focus:ring-orange-300 focus:border-orange-300 outline-none text-base"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="検索をクリア"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* コンテンツ（スクロール可能） */}
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        {(() => {
          const filteredUsers = getFilteredUsers(displayUsers, searchQuery);

          if (searchQuery && filteredUsers.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-gray-500 text-base">
                  該当するユーザーが見つかりませんでした
                </p>
              </div>
            );
          }

          return (
            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-4 rounded-2xl border border-orange-200 bg-white"
                >
                  {/* アバター */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: getBgColor(user.name) }}
                  >
                    {getInitials(user.name)}
                  </div>

                  {/* ユーザー情報 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-lg text-gray-800 truncate">
                      {user.name}
                    </p>
                    {user.bio && (
                      <p className="text-sm text-gray-600 truncate">
                        {user.bio}
                      </p>
                    )}
                  </div>

                  {/* ともだちボタン */}
                  <button
                    onClick={() => toggleFriend(user.id)}
                    disabled={processingUsers.has(user.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-full transition-opacity ${
                      processingUsers.has(user.id) ||
                      (isRestricted &&
                        !(!friends.has(user.id) && isNewUser(user.id)))
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    style={{
                      backgroundColor: friends.has(user.id)
                        ? "#f97316"
                        : "#fbbf24",
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
                        alt={
                          friends.has(user.id) ? "フォロー解除" : "フォロー追加"
                        }
                        width={20}
                        height={20}
                      />
                    )}
                    {processingUsers.has(user.id) ? (
                      <span className="text-sm font-bold">処理中...</span>
                    ) : isRestricted &&
                      !(!friends.has(user.id) && isNewUser(user.id)) ? (
                      <span className="text-sm font-bold">制限中</span>
                    ) : friends.has(user.id) ? (
                      <span className="text-sm font-bold">フォロー中</span>
                    ) : null}
                  </button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* 情報ポップアップ */}
      {showInfoPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-bold text-orange-500 mb-2 text-center whitespace-nowrap leading-tight">
              フォローはあなただけのものです。
            </h3>
            <p className="text-base font-semibold text-gray-800 mb-5 text-center whitespace-nowrap leading-tight">
              フォローしても相手には通知されません。
            </p>
            <div className="space-y-2 flex flex-col items-center">
              <button
                onClick={() => {
                  const uid = localStorage.getItem("userId");
                  if (uid) {
                    localStorage.setItem(`hideFollowInfoPopup-${uid}`, "true");
                  }
                  setShowInfoPopup(false);
                }}
                className="w-full max-w-[260px] bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold leading-snug text-center"
              >
                理解したので次からはこの通知は表示しない
              </button>
              <button
                onClick={() => setShowInfoPopup(false)}
                className="w-full max-w-[260px] bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold text-center"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 警告ポップアップ */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            {warningType === "min_friends" && (
              <>
                <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
                  2人以上フォローしてください。
                </h3>
                <button
                  onClick={handleWarningClose}
                  className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold"
                >
                  閉じる
                </button>
              </>
            )}
            {warningType === "daily_limit" && (
              <>
                <h3 className="text-lg font-bold text-gray-800 mb-2 text-center">
                  一度変更すると1時間ロックされます
                </h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  今日は今回限りになります。本当にメイン画面に戻りますか？（新規参加者の追加はいつでもできます）
                </p>
                <div className="space-y-2">
                  <button
                    onClick={handleConfirmBack}
                    className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold"
                  >
                    メイン画面に戻る
                  </button>
                  <button
                    onClick={handleWarningClose}
                    className="w-full bg-gray-200 text-gray-700 py-3 rounded-xl font-bold"
                  >
                    フォロー状態を確認する
                  </button>
                </div>
              </>
            )}
            {warningType === "time_remaining" && (
              <>
                <h3 className="text-lg font-bold text-gray-800 mb-2 text-center">
                  一度変更すると1時間ロックされます
                </h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  次は{remainingTime}後に変更が可能です。
                </p>
                <button
                  onClick={handleWarningClose}
                  className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold"
                >
                  閉じる
                </button>
              </>
            )}
            {warningType === "locked" && (
              <>
                <h3 className="text-lg font-bold text-gray-800 mb-2 text-center">
                  現在編集をロックしています
                </h3>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  次の編集は{remainingTime}後に可能です。
                  <br />
                  新規ユーザーはいつでも追加できます。
                </p>
                <button
                  onClick={handleWarningClose}
                  className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold"
                >
                  閉じる
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
