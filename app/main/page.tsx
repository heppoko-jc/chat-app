// app/main/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import Image from "next/image";
import FixedTabBar from "../components/FixedTabBar";
import { useRouter } from "next/navigation";
import { useChatData, PresetMessage } from "../contexts/ChatDataContext";
import { useLanguage } from "../contexts/LanguageContext";
import MatchNotification from "../components/MatchNotification";
import ErrorNotification from "../components/ErrorNotification";
import socket, { setSocketUserId } from "../socket";
import type { ChatItem } from "../chat-list/page";
import ShortcutCreateModal from "../components/ShortcutCreateModal";
import ShortcutEditModal from "../components/ShortcutEditModal";
import TranslatedMessage from "../components/TranslatedMessage";

interface User {
  id: string;
  name: string;
  bio: string;
}

interface ShortcutMember {
  id: string;
  memberId: string;
  memberName: string;
  memberBio: string | null;
  order: number;
}

interface Shortcut {
  id: string;
  userId: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  members: ShortcutMember[];
  memberCount: number;
}
type ChatListApiItem = Omit<
  ChatItem,
  "latestMessageAtDisplay" | "latestMessageAtRaw"
> & {
  latestMessageAt: string | null;
};

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

// ショートカット用の色を生成（個人よりも少し濃い）
function getShortcutBgColor(shortcutId: string) {
  let hash = 0;
  for (let i = 0; i < shortcutId.length; i++)
    hash = shortcutId.charCodeAt(i) + ((hash << 5) - hash);
  const h = hash % 360;
  // 個人よりも少し濃い色（明度を下げる）
  return `hsl(${h}, 75%, 65%)`;
}

// 最後に送信された時刻を「何分前、何時間前、何日前」で表示する関数（翻訳対応）
function formatLastSentAt(lastSentAt: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = new Date();
  const sentDate = new Date(lastSentAt);
  const diffMs = now.getTime() - sentDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return t("time.justNow");
  } else if (diffMinutes < 60) {
    return t("time.minutesAgo", { n: diffMinutes });
  } else if (diffHours < 24) {
    return t("time.hoursAgo", { n: diffHours });
  } else if (diffDays < 7) {
    return t("time.daysAgo", { n: diffDays });
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return t("time.weeksAgo", { n: weeks });
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return t("time.monthsAgo", { n: months });
  } else {
    const years = Math.floor(diffDays / 365);
    return t("time.yearsAgo", { n: years });
  }
}

// 「最新送信順」：lastSentAt desc
const sortByNewest = (arr: PresetMessage[]) =>
  [...arr].sort(
    (a, b) =>
      new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime()
  );

// ── ポップアップ・キュー要素
type MatchQueueItem = {
  matchId?: string;
  matchedAt: string;
  message: string;
  matchedUser: { id: string; name: string };
  chatId?: string;
};

// ── キュー重複排除＋成立時刻昇順マージ（常に MatchQueueItem[] を返す）
const keyOf = (i: MatchQueueItem) =>
  `${i.matchId ?? ""}|${i.matchedUser.id}|${i.message}|${i.matchedAt}`;

// 表示済みマッチIDを管理する関数
const getShownMatchesKey = (userId: string) => `shown-matches-${userId}`;

const getShownMatches = (userId: string): Set<string> => {
  try {
    const stored = localStorage.getItem(getShownMatchesKey(userId));
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const addShownMatch = (userId: string, matchKey: string) => {
  try {
    const shown = getShownMatches(userId);
    shown.add(matchKey);
    // 最新1000件のみ保持（メモリ節約）
    const array = Array.from(shown);
    const limited = array.slice(-1000);
    localStorage.setItem(getShownMatchesKey(userId), JSON.stringify(limited));
  } catch (e) {
    console.error("Failed to save shown match:", e);
  }
};

const mergeQueue = (
  prev: MatchQueueItem[],
  incoming: MatchQueueItem[]
): MatchQueueItem[] => {
  const map = new Map<string, MatchQueueItem>();
  for (const p of prev) map.set(keyOf(p), p);
  for (const n of incoming) map.set(keyOf(n), n);

  // 表示済みマッチのフィルタリングを一時的に無効化
  // これにより先に送った側の通知も即座に表示される
  const filtered = [...map.values()];

  return filtered.sort(
    (a, b) => new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
  );
};

export default function Main() {
  const router = useRouter();
  const { t, toggleLanguage } = useLanguage();

  // 全員選択機能の表示/非表示（将来の利用のため非表示に設定）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const SHOW_SELECT_ALL = false;

  // ステート
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [hasNewUsers, setHasNewUsers] = useState(false);
  const [lastSentMap, setLastSentMap] = useState<Record<string, string | null>>(
    {}
  );
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(
    []
  );
  const [isSent, setIsSent] = useState(false);
  const [step, setStep] = useState<"select-message" | "select-recipients">(
    "select-message"
  );
  const [sentMessageInfo, setSentMessageInfo] = useState<{
    message: string;
    recipients: string[];
  } | null>(null);
  const [isInputMode, setIsInputMode] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const { presetMessages, setPresetMessages, setChatList } = useChatData();
  const [errorNotification, setErrorNotification] = useState<{
    isVisible: boolean;
    message: string;
  }>({
    isVisible: false,
    message: "",
  });
  const [isSending, setIsSending] = useState(false);
  const [linkPreview, setLinkPreview] = useState<{
    url: string;
    title: string;
    image?: string;
  } | null>(null);

  const [linkComment, setLinkComment] = useState<string>("");

  const [selectedMessageLinkData, setSelectedMessageLinkData] = useState<{
    url: string;
    title: string;
    image?: string;
  } | null>(null);

  // ショートカット関連の状態
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [showShortcutCreateModal, setShowShortcutCreateModal] = useState(false);
  const [showShortcutEditModal, setShowShortcutEditModal] = useState(false);
  const [selectedShortcut, setSelectedShortcut] = useState<Shortcut | null>(
    null
  );
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(
    null
  );
  const [isLongPressTriggered, setIsLongPressTriggered] = useState(false);
  const [selectedShortcutIds, setSelectedShortcutIds] = useState<Set<string>>(
    new Set()
  );

  // 検索機能用のステート
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  // デバウンス処理（300ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 画面遷移時に検索クエリをリセット
  useEffect(() => {
    if (step !== "select-recipients") {
      setSearchQuery("");
      setDebouncedSearchQuery("");
    }
  }, [step]);

  // Phase 2.1: 安全なキャッシュ基盤の構築（一時的に無効化）
  // const useMessageCache = () => {
  //   const [cache, setCache] = useState<{
  //     data: PresetMessage[];
  //     timestamp: number;
  //     friendIds: string[];
  //   }>({
  //     data: [],
  //     timestamp: 0,
  //     friendIds: [],
  //   });

  //   // キャッシュの有効性をチェック（依存関係を最小限に）
  //   const isCacheValid = useCallback(
  //     (currentFriendIds: string[]) => {
  //       const now = Date.now();
  //       const CACHE_DURATION = 5 * 60 * 1000; // 5分間キャッシュ

  //       // キャッシュが古い場合は無効
  //       if (now - cache.timestamp > CACHE_DURATION) {
  //         return false;
  //       }

  //       // ともだちリストが変更された場合は無効
  //       const friendIdsChanged =
  //         currentFriendIds.length !== cache.friendIds.length ||
  //         !currentFriendIds.every((id) => cache.friendIds.includes(id));

  //       return !friendIdsChanged;
  //     },
  //     [cache.timestamp, cache.friendIds]
  //   );

  //   // キャッシュを更新（依存関係なし）
  //   const updateCache = useCallback(
  //     (newData: PresetMessage[], friendIds: string[]) => {
  //       setCache({
  //         data: newData,
  //         timestamp: Date.now(),
  //         friendIds: friendIds,
  //       });
  //     },
  //     []
  //   );

  //   // キャッシュをクリア（依存関係なし）
  //   const clearCache = useCallback(() => {
  //     setCache({
  //       data: [],
  //       timestamp: 0,
  //       friendIds: [],
  //     });
  //   }, []);

  //   return {
  //     cache,
  //     isCacheValid,
  //     updateCache,
  //     clearCache,
  //   };
  // };

  // Phase 2.3: エラーハンドリングとパフォーマンス監視（一時的に無効化）
  // const { cache, isCacheValid, updateCache, clearCache } = useMessageCache();
  // const [performanceMetrics, setPerformanceMetrics] = useState({
  //   apiCalls: 0,
  //   cacheHits: 0,
  //   errors: 0,
  //   lastCallTime: 0,
  // });

  // Phase 2.5: Pull to Refresh機能（Step 1: 最小限の実装）
  const usePullToRefresh = () => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(0);

    const MIN_REFRESH_INTERVAL = 5000; // 5秒間隔
    const MIN_DISPLAY_TIME = 1000; // スピナーの最小表示時間（1秒）

    const handleRefresh = useCallback(async () => {
      const now = Date.now();
      if (now - lastRefresh < MIN_REFRESH_INTERVAL) {
        console.log("Pull to Refresh: 間隔が短すぎます");
        return;
      }

      if (isRefreshing) {
        console.log("Pull to Refresh: 既に更新中です");
        return;
      }

      setIsRefreshing(true);
      setLastRefresh(now);
      const startTime = Date.now();

      try {
        console.log("Pull to Refresh: 更新開始");

        // マッチメッセージの更新（直接API呼び出しで依存関係を避ける）
        const uid = localStorage.getItem("userId");
        if (!uid) {
          throw new Error("ユーザーIDが取得できません");
        }

        const res = await axios.get<PresetMessage[]>("/api/preset-message", {
          headers: { userId: uid },
        });

        if (!res.data || !Array.isArray(res.data)) {
          throw new Error("無効なレスポンスデータ");
        }

        setPresetMessages(sortByNewest(res.data));

        // History画面の情報更新（新規ユーザー）- 一時的に無効化
        // TODO: /api/users/new エンドポイントが存在するか確認後、有効化
        console.log(
          "Pull to Refresh: 新規ユーザー更新は一時的に無効化されています"
        );

        // ともだち登録画面の情報更新（ともだちリスト）
        try {
          const friendsRes = await axios.get<
            { id: string; friendId: string }[]
          >("/api/friends", {
            headers: { userId: uid },
          });

          if (!friendsRes.data || !Array.isArray(friendsRes.data)) {
            console.warn("Pull to Refresh: ともだちリストのデータが無効です");
            return;
          }

          const newFriends = new Set(friendsRes.data.map((f) => f.friendId));
          setFriends(newFriends);
          console.log("Pull to Refresh: ともだちリストを更新", newFriends.size);
        } catch (error) {
          console.error("Pull to Refresh: ともだちリスト取得エラー", error);
          // エラーが発生してもメインの更新処理は継続
        }

        // ショートカット一覧更新
        try {
          const shortcutsRes = await axios.get<Shortcut[]>("/api/shortcuts", {
            headers: { userId: uid },
          });

          if (!shortcutsRes.data || !Array.isArray(shortcutsRes.data)) {
            console.warn(
              "Pull to Refresh: ショートカットリストのデータが無効です"
            );
            return;
          }

          setShortcuts(shortcutsRes.data);
          console.log(
            "Pull to Refresh: ショートカットリストを更新",
            shortcutsRes.data.length
          );
        } catch (error) {
          console.error(
            "Pull to Refresh: ショートカットリスト取得エラー",
            error
          );
          // エラーが発生してもメインの更新処理は継続
        }

        console.log("Pull to Refresh: 更新完了");
      } catch (error) {
        console.error("Pull to Refresh: 更新エラー", error);
      } finally {
        // 最小表示時間を確保
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_DISPLAY_TIME - elapsedTime);

        if (remainingTime > 0) {
          console.log(
            `Pull to Refresh: スピナーを${remainingTime}ms表示します`
          );
          setTimeout(() => {
            setIsRefreshing(false);
          }, remainingTime);
        } else {
          setIsRefreshing(false);
        }
      }
    }, [isRefreshing, lastRefresh]);

    return {
      isRefreshing,
      handleRefresh,
    };
  };

  const { isRefreshing, handleRefresh } = usePullToRefresh();

  // スピナーの強制表示用の状態（本番用では不要）
  // const [forceSpinner, setForceSpinner] = useState(false);

  // Step 2: Pull to Refresh用の状態管理
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [touchStart, setTouchStart] = useState<{
    y: number;
    scrollTop: number;
  } | null>(null);

  // Pull to Refresh表示（本番用）
  const PullToRefreshIndicator = () => {
    const shouldShow = isRefreshing || (isPulling && pullDistance >= 40);
    const progress = Math.min(pullDistance / 150, 1); // 0-1の範囲で正規化

    return (
      <div
        className="flex justify-center items-center py-4 transition-all duration-200 ease-out"
        style={{
          transform: `translateY(${Math.min(pullDistance, 60)}px)`,
          opacity: shouldShow ? 1 : 0,
          height: shouldShow ? "60px" : "0px",
          overflow: "hidden",
        }}
      >
        <div className="flex flex-col items-center">
          {isRefreshing ? (
            // 更新中のスピナー
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-black mb-2"></div>
              <div className="text-xs text-black font-bold">更新中...</div>
            </div>
          ) : isPulling ? (
            // 引っ張っている時のインジケーター
            <div className="relative">
              <div
                className="rounded-full h-6 w-6 border-2 border-gray-300"
                style={{
                  background: `conic-gradient(from 0deg, #000000 ${
                    progress * 360
                  }deg, #d1d5db 0deg)`,
                }}
              ></div>
            </div>
          ) : null}

          <p className="text-sm text-black mt-2 font-medium">
            {isPulling ? "離すと更新" : ""}
          </p>
        </div>
      </div>
    );
  };

  const [selectedMessageContent, setSelectedMessageContent] = useState<
    string | null
  >(null);

  const [showLinkActionMenu, setShowLinkActionMenu] = useState(false);

  // IME入力中かどうかを追跡
  const [isComposing, setIsComposing] = useState(false);

  // URLの境界をより正確に検出する関数
  const extractUrlAndText = (input: string) => {
    console.log("[extractUrlAndText] Input:", input);

    // 全角スペースを半角スペースに変換
    const normalizedInput = input.replace(/　/g, " ");
    console.log("[extractUrlAndText] Normalized input:", normalizedInput);

    // スペースありの場合をチェック
    const spaceMatch = normalizedInput.match(/^(https?:\/\/[^\s]+)\s+(.+)$/i);
    if (spaceMatch) {
      const url = spaceMatch[1];
      const text = spaceMatch[2];
      console.log(
        "[extractUrlAndText] Space detected - URL:",
        url,
        "Text:",
        text
      );
      return { url, text };
    }

    // スペースなしの場合をチェック（URLの後に直接テキストが続く場合）
    // より厳密なURLパターンを使用
    const directMatch = normalizedInput.match(
      /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%].+)$/
    );
    if (directMatch && directMatch[2]) {
      const url = directMatch[1];
      const text = directMatch[2];
      console.log(
        "[extractUrlAndText] Direct text detected - URL:",
        url,
        "Text:",
        text
      );
      return { url, text };
    }

    // URLのみの場合
    const urlOnlyMatch = normalizedInput.match(
      /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)$/
    );
    if (urlOnlyMatch) {
      const url = urlOnlyMatch[1];
      console.log("[extractUrlAndText] URL only - URL:", url);
      return { url, text: null };
    }

    console.log("[extractUrlAndText] No URL found");
    return null;
  };

  // 新規参加者チェック関数
  const checkNewUsers = async (userId: string) => {
    try {
      const lastFriendsVisit = localStorage.getItem(
        `lastFriendsPageVisit-${userId}`
      );

      if (!lastFriendsVisit) {
        // 初回は表示しない
        setHasNewUsers(false);
        return;
      }

      const response = await axios.get(
        `/api/users/new?since=${lastFriendsVisit}`
      );
      setHasNewUsers(response.data.length > 0);
    } catch (error) {
      console.error("新規参加者チェックエラー:", error);
      setHasNewUsers(false);
    }
  };

  // 入力がURLを含む場合、プレビューを取得
  useEffect(() => {
    console.log("[main] inputMessage changed:", inputMessage);

    // 先頭の @ や空白を除去してから URL を抽出（Xやメモアプリ風の貼り付け対策）
    const cleaned = (inputMessage || "").replace(/^[@\s]+/, "");
    console.log("[main] cleaned input:", cleaned);

    // まず状態をリセット
    setLinkPreview(null);
    setLinkComment("");

    // 新しいURL検出ロジックを使用
    const urlAndText = extractUrlAndText(cleaned);
    console.log("[main] URL and text extraction:", {
      input: cleaned,
      result: urlAndText,
    });

    if (urlAndText && urlAndText.text) {
      const url = urlAndText.url;
      const text = urlAndText.text;
      console.log("[main] Link with text detected - URL:", url, "Text:", text);

      // コメント部分を別の状態で管理
      setLinkComment(text);

      // リンク+テキストの場合は、まずリンクのメタデータを取得
      setLinkPreview({
        url,
        title: "Loading...",
        image: undefined,
      });

      // リンクのメタデータを取得
      (async () => {
        try {
          // キャッシュを無効化するためにタイムスタンプを追加
          const cacheBuster = Date.now() + Math.random();
          const res = await fetch(
            `/api/link-preview?url=${encodeURIComponent(url)}&t=${cacheBuster}`
          );
          if (res.ok) {
            const data = await res.json();
            console.log("[main] Link metadata received:", data);
            setLinkPreview({
              url,
              title: data.title || url,
              image: data.image,
            });
          } else {
            setLinkPreview({
              url,
              title: url,
              image: undefined,
            });
          }
        } catch (error) {
          console.error("[main] Error fetching link metadata:", error);
          setLinkPreview({
            url,
            title: url,
            image: undefined,
          });
        }
      })();
      return;
    }

    // 通常のURL検出（リンク+テキストでない場合）
    let url: string | null = null;

    if (urlAndText && !urlAndText.text) {
      url = urlAndText.url;
      console.log("[main] Single URL detected:", url);
    } else if (urlAndText && urlAndText.text) {
      // リンク+テキストの場合は既に処理済み
      return;
    } else {
      // URLが見つからない場合は即座にプレビューをクリア
      console.log("[main] no URL found, clearing preview");
      setLinkPreview(null);
      setLinkComment("");
      return;
    }

    // 新しいURLの場合は即座にローディング状態を設定
    console.log("[main] new URL detected, setting loading state");
    setLinkPreview({
      url,
      title: "Loading...",
      image: undefined,
    });

    console.log("[main] starting fetch for:", url);
    let aborted = false;
    (async () => {
      try {
        const cacheBuster = Date.now() + Math.random();
        const res = await fetch(
          `/api/link-preview?url=${encodeURIComponent(url!)}&t=${cacheBuster}`
        );
        console.log("[main] fetch response:", res.status, res.ok);
        if (!aborted) {
          // レスポンス受信時に再度URLをチェック（競合状態を防ぐ）
          const currentCleaned = (inputMessage || "").replace(/^[@\s]+/, "");
          const currentUrl = extractUrlAndText(currentCleaned)?.url;

          if (currentUrl !== url) {
            console.log("[main] URL changed during fetch, ignoring result");
            return;
          }

          if (!res.ok) {
            // 失敗時はno title/no photoを表示
            console.log("[main] fetch failed, showing no data preview");
            setLinkPreview({
              url,
              title: "no title",
              image: undefined,
            });
            return;
          }
          const data = await res.json();
          console.log("[main] fetch success, data:", data);
          console.log(
            "[main] Setting linkPreview with title:",
            data.title,
            "image:",
            data.image
          );
          setLinkPreview({
            url: data.url || url,
            title: data.title || "no title",
            image: data.image || undefined,
          });
        }
      } catch (e) {
        console.log("[main] fetch error:", e);
        if (!aborted) {
          // エラー時もURLをチェック
          const currentCleaned = (inputMessage || "").replace(/^[@\s]+/, "");
          const currentUrl = extractUrlAndText(currentCleaned)?.url;

          if (currentUrl === url) {
            setLinkPreview({
              url,
              title: "no title",
              image: undefined,
            });
          }
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [inputMessage]);

  // ポップアップ・キュー
  const [matchQueue, setMatchQueue] = useState<MatchQueueItem[]>([]);
  const queueHead = matchQueue[0] ?? null;
  const isPopupVisible = !!queueHead;

  // localStorage の「最後に表示した matchedAt」キー
  const lastSeenKey = useMemo(
    () => (currentUserId ? `last-match-popup-seen-at-${currentUserId}` : null),
    [currentUserId]
  );

  // Phase 2.2: 依存関係の最適化（古いコードを削除）

  // Phase 2.3: 基本的なプリセットマッチメッセージ取得（キャッシュ機能を一時的に無効化）
  const fetchPresetMessages = useCallback(async () => {
    try {
      const uid = localStorage.getItem("userId");
      console.log("fetchPresetMessages called (基本モード)");

      console.log("APIからメッセージを取得");
      const res = await axios.get<PresetMessage[]>("/api/preset-message", {
        headers: { userId: uid }, // ユーザーIDをヘッダーで送信
      });

      setPresetMessages(sortByNewest(res.data));
    } catch (e) {
      console.error("preset取得エラー:", e);
      setPresetMessages([]);
    }
  }, [setPresetMessages]);

  // チャットリスト（一時的に無効化 - 500エラー回避）
  const fetchChatList = useCallback(
    async (uid: string) => {
      try {
        console.log(
          "fetchChatList: 一時的に無効化されています（500エラー回避）"
        );
        return; // 一時的に無効化

        const chatListResponse = await axios.get<ChatListApiItem[]>(
          "/api/chat-list",
          {
            headers: { userId: uid },
          }
        );
        const formattedChatList: ChatItem[] = chatListResponse.data
          .map(
            (c): ChatItem => ({
              ...c,
              latestMessageAtRaw: c.latestMessageAt ?? "",
              latestMessageAt: c.latestMessageAt
                ? new Date(c.latestMessageAt).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "",
            })
          )
          .sort((a, b) => {
            const ta = a.latestMessageAtRaw
              ? new Date(a.latestMessageAtRaw).getTime()
              : 0;
            const tb = b.latestMessageAtRaw
              ? new Date(b.latestMessageAtRaw).getTime()
              : 0;
            return tb - ta;
          });
        setChatList(formattedChatList);
      } catch (error) {
        console.error("チャットリスト更新エラー:", error);
      }
    },
    [setChatList]
  );

  // 初期ロード
  useEffect(() => {
    const uid = localStorage.getItem("userId");
    setCurrentUserId(uid);

    if (uid) {
    }

    axios
      .get<User[]>("/api/users")
      .then((res) => setUsers(res.data))
      .catch((e) => console.error("ユーザー取得エラー:", e));

    // ともだち一覧取得
    if (uid) {
      axios
        .get<{ id: string; friendId: string }[]>("/api/friends", {
          headers: { userId: uid },
        })
        .then((res) => {
          const newFriends = new Set(res.data.map((f) => f.friendId));
          setFriends(newFriends);
        })
        .catch((e) => console.error("ともだち一覧取得エラー:", e));

      // ショートカット一覧取得
      axios
        .get<Shortcut[]>("/api/shortcuts", {
          headers: { userId: uid },
        })
        .then((res) => {
          setShortcuts(res.data);
        })
        .catch((e) => console.error("ショートカット一覧取得エラー:", e));

      // 新規参加者チェック
      checkNewUsers(uid);
    }

    if (uid) {
      axios
        .get<{ userId: string; lastSentAt: string | null }[]>(
          "/api/users/last-sent",
          {
            headers: { userId: uid },
          }
        )
        .then((res) => {
          const map: Record<string, string | null> = {};
          res.data.forEach((row) => {
            map[row.userId] = row.lastSentAt;
          });
          setLastSentMap(map);
        })
        .catch((e) => console.error("last-sent 取得エラー:", e));
    }

    fetchPresetMessages();
    if (uid) fetchChatList(uid);
  }, [fetchPresetMessages, fetchChatList]);

  // 非表示中に溜まったマッチを取り込み（成立順でキューへ）
  const pullPendingMatches = useCallback(async () => {
    if (!currentUserId || !lastSeenKey) return;
    try {
      const since =
        localStorage.getItem(lastSeenKey) || "1970-01-01T00:00:00.000Z";
      const res = await axios.get<{ items: MatchQueueItem[] }>(
        `/api/match-pending?since=${encodeURIComponent(since)}`,
        { headers: { userId: currentUserId } }
      );
      if (Array.isArray(res.data.items) && res.data.items.length > 0) {
        const incoming = [...res.data.items].sort(
          (a, b) =>
            new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
        );
        setMatchQueue((prev) => mergeQueue(prev, incoming));
      }
    } catch (e) {
      console.error("未表示マッチの取得失敗:", e);
    }
  }, [currentUserId, lastSeenKey]);

  // 可視化時：再取得＋未表示マッチ取り込み（初回も即実行）
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        // Phase 2: キャッシュを考慮したメッセージ取得
        fetchPresetMessages();
        const uid = localStorage.getItem("userId");
        if (uid) fetchChatList(uid);
        pullPendingMatches();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchPresetMessages, fetchChatList, pullPendingMatches]);

  // ソケット：両者に通知 → 即キューへ
  useEffect(() => {
    if (!currentUserId) return;
    setSocketUserId(currentUserId); // 再接続時の取りこぼし防止

    const handleMatchEstablished = (data: {
      matchId: string;
      chatId?: string;
      message: string;
      matchedAt: string;
      matchedUserId?: string;
      matchedUserName?: string;
      targetUserId?: string;
    }) => {
      // 自分宛のみ（targetUserIdが指定されている場合はチェック、指定されていない場合は全て受け取る）
      if (data.targetUserId && data.targetUserId !== currentUserId) return;

      if (data.matchedUserId && data.matchedUserName) {
        const item: MatchQueueItem = {
          matchId: data.matchId,
          matchedAt: data.matchedAt,
          message: data.message,
          matchedUser: { id: data.matchedUserId, name: data.matchedUserName },
          chatId: data.chatId,
        };

        // 即座にキューに追加（フィルタリングは無効化済み）
        setMatchQueue((prev) => mergeQueue(prev, [item]));
      }

      // 表示情報の同期（少し遅延させてサーバー側のデータ更新を待つ）
      fetchPresetMessages();
      setTimeout(() => {
        fetchChatList(currentUserId);
      }, 300);
    };

    socket.on("matchEstablished", handleMatchEstablished);
    return () => {
      socket.off("matchEstablished", handleMatchEstablished);
    };
  }, [currentUserId, fetchPresetMessages, fetchChatList]);

  // Pull to Refresh用のタッチハンドラー
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // Pull to Refresh用のタッチ開始
      if (isRefreshing) return;

      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      if (scrollTop > 0) return; // 一番上でない場合は無視

      setTouchStart({
        y: e.touches[0].clientY,
        scrollTop: scrollTop,
      });
    },
    [isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // Pull to Refresh用のタッチ移動
      if (!touchStart || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStart.y;

      if (deltaY > 0) {
        // 下に引っ張っている
        const distance = Math.min(deltaY * 0.4, 200); // 抵抗感を強く演出
        setPullDistance(distance);
        setIsPulling(true);

        if (distance >= 150) {
          // 閾値を超えたら更新実行（より厳しい条件）
          handleRefresh();
          setTouchStart(null);
          setPullDistance(0);
          setIsPulling(false);
        }
      }
    },
    [touchStart, isRefreshing, handleRefresh]
  );

  const handleTouchEnd = useCallback(() => {
    // Pull to Refresh用のタッチ終了
    if (isPulling && !isRefreshing) {
      setPullDistance(0);
      setIsPulling(false);
    }
    setTouchStart(null);
  }, [isPulling, isRefreshing]);

  const handleHistoryNavigation = () => router.push("/notifications");

  const handleSelectMessage = (
    msg: string,
    linkData?: { url: string; title: string; image?: string }
  ) => {
    // リンクの場合はアクションメニューを表示
    if (linkData) {
      setShowLinkActionMenu(true);
      return;
    }

    setSelectedMessage((prev) => {
      // 新しく選択した場合（以前の選択と異なる場合）のみ送信先リストに遷移
      if (prev !== msg) {
        // 次のレンダリングサイクルで遷移するようにsetTimeoutを使用
        setTimeout(() => {
          setStep("select-recipients");
        }, 0);
      }
      return prev === msg ? null : msg;
    });
    setInputMessage("");
    setSelectedMessageLinkData(null);
  };

  const handleLinkAction = (action: "open" | "select") => {
    if (!selectedMessageLinkData) return;

    console.log("[handleLinkAction] Action:", action);
    console.log(
      "[handleLinkAction] selectedMessageLinkData:",
      selectedMessageLinkData
    );
    console.log("[handleLinkAction] URL to open:", selectedMessageLinkData.url);

    if (action === "open") {
      // リンク先を開く
      window.open(selectedMessageLinkData.url, "_blank");
      setShowLinkActionMenu(false);
    } else if (action === "select") {
      // マッチメッセージとして選択
      // 保存されている元のメッセージからコメント部分を抽出
      let commentText = "";
      if (selectedMessageContent) {
        const urlAndText = extractUrlAndText(selectedMessageContent);
        if (urlAndText && urlAndText.text) {
          commentText = urlAndText.text;
        }
      }

      // 送信待機バーにlinkPreviewとコメントを表示
      setLinkPreview({
        url: selectedMessageLinkData.url,
        title: selectedMessageLinkData.title,
        image: selectedMessageLinkData.image,
      });
      setLinkComment(commentText);

      // selectedMessageはクリアして、linkPreviewとlinkCommentで管理
      setSelectedMessage(null);
      setInputMessage("");
      setShowLinkActionMenu(false);
      setIsInputMode(true);
      // 送信先リストに自動的に遷移
      setTimeout(() => {
        setStep("select-recipients");
      }, 0);
    }
  };
  const toggleRecipient = (id: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ショートカット選択時の処理（メンバーを自動選択）
  const toggleShortcut = (shortcut: Shortcut) => {
    const memberIds = shortcut.members.map((m) => m.memberId);
    const isShortcutSelected = selectedShortcutIds.has(shortcut.id);

    if (isShortcutSelected) {
      // ショートカットを解除
      setSelectedShortcutIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(shortcut.id);
        return newSet;
      });
      // メンバーを解除（重複チェック）
      setSelectedRecipientIds((prev) => {
        // このショートカットのメンバーを解除
        // ただし、他の選択されたショートカットに含まれているメンバーは残す
        const otherSelectedShortcuts = shortcuts.filter(
          (s) => s.id !== shortcut.id && selectedShortcutIds.has(s.id)
        );
        const otherMemberIds = new Set(
          otherSelectedShortcuts.flatMap((s) =>
            s.members.map((m) => m.memberId)
          )
        );

        return prev.filter((id) => {
          // このショートカットのメンバーで、かつ他のショートカットに含まれていない場合のみ削除
          if (memberIds.includes(id)) {
            return otherMemberIds.has(id);
          }
          return true;
        });
      });
    } else {
      // ショートカットを選択
      setSelectedShortcutIds((prev) => {
        const newSet = new Set(prev);
        newSet.add(shortcut.id);
        return newSet;
      });
      // メンバーを選択（重複は自動的に除外される）
      setSelectedRecipientIds((prev) => {
        const newIds = [...prev];
        memberIds.forEach((id) => {
          if (!newIds.includes(id)) {
            newIds.push(id);
          }
        });
        return newIds;
      });
    }
  };

  // ショートカット作成成功時の処理
  const handleShortcutCreateSuccess = async () => {
    if (!currentUserId) return;
    try {
      const res = await axios.get<Shortcut[]>("/api/shortcuts", {
        headers: { userId: currentUserId },
      });
      setShortcuts(res.data);
    } catch (error) {
      console.error("ショートカット一覧取得エラー:", error);
    }
  };

  // ショートカット更新成功時の処理
  const handleShortcutUpdateSuccess = async () => {
    if (!currentUserId) return;
    try {
      const res = await axios.get<Shortcut[]>("/api/shortcuts", {
        headers: { userId: currentUserId },
      });
      setShortcuts(res.data);
    } catch (error) {
      console.error("ショートカット一覧取得エラー:", error);
    }
  };

  // ショートカット削除成功時の処理
  const handleShortcutDeleteSuccess = async () => {
    if (!currentUserId) return;
    try {
      const res = await axios.get<Shortcut[]>("/api/shortcuts", {
        headers: { userId: currentUserId },
      });
      setShortcuts(res.data);
    } catch (error) {
      console.error("ショートカット一覧取得エラー:", error);
    }
  };

  // 長押し開始
  const handleShortcutTouchStart = (shortcut: Shortcut) => {
    setIsLongPressTriggered(false);
    const timer = setTimeout(() => {
      setIsLongPressTriggered(true);
      setSelectedShortcut(shortcut);
      setShowShortcutEditModal(true);
    }, 500); // 500ms長押し
    setLongPressTimer(timer);
  };

  // 長押し終了
  const handleShortcutTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    // 長押しが発動した場合は、クリックイベントを無効化するため少し待つ
    setTimeout(() => {
      setIsLongPressTriggered(false);
    }, 100);
  };

  // 長押しキャンセル
  const handleShortcutTouchCancel = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPressTriggered(false);
  };

  // 表示用：count>0 & 「最新送信順」
  const messageOptions = presetMessages
    .filter((m) => (m.count ?? 0) > 0)
    .sort(
      (a, b) =>
        new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime()
    );

  // リンクプレビューは送信待機バーに表示するため、メッセージリストには含めない
  const allMessageOptions = useMemo(() => {
    return [...messageOptions];
  }, [messageOptions]);

  // カタカナをひらがなに変換する関数（検索用）
  const katakanaToHiragana = useCallback((str: string): string => {
    return str.replace(/[\u30A1-\u30F6]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) - 0x60);
    });
  }, []);

  // 検索用の正規化関数（ひらがな/カタカナを統一、大文字小文字を統一）
  const normalizeForSearch = useCallback((str: string): string => {
    if (!str) return "";
    // ひらがなに統一
    let normalized = katakanaToHiragana(str);
    // 小文字に統一
    normalized = normalized.toLowerCase();
    return normalized;
  }, [katakanaToHiragana]);

  // ともだちの検索フィルタリング関数
  const getFilteredFriends = useCallback((friends: User[], query: string): User[] => {
    if (!query.trim()) return friends;

    const normalizedQuery = normalizeForSearch(query);

    return friends.filter((user) => {
      // 検索対象: 名前とbio
      const searchableFields = [user.name, user.bio].filter(Boolean) as string[];

      // 各フィールドで部分一致チェック
      return searchableFields.some((field) => {
        const normalizedField = normalizeForSearch(field);
        return normalizedField.includes(normalizedQuery);
      });
    });
  }, [normalizeForSearch]);

  // 表示中のともだち一覧（フィルタ＋ソートを共通化）
  const visibleFriends = useMemo(() => {
    const filtered = users
      .filter((u) => u.id !== currentUserId && friends.has(u.id))
      .slice()
      .sort((a, b) => {
        const la = lastSentMap[a.id];
        const lb = lastSentMap[b.id];
        if (la && lb) return new Date(lb).getTime() - new Date(la).getTime();
        if (la && !lb) return -1;
        if (!la && lb) return 1;
        return a.name.localeCompare(b.name, "ja");
      });

    // 検索クエリでフィルタリング（個人名のみ）
    return getFilteredFriends(filtered, debouncedSearchQuery);
  }, [users, currentUserId, friends, lastSentMap, debouncedSearchQuery, getFilteredFriends]);

  const allVisibleSelected = useMemo(() => {
    if (visibleFriends.length === 0) return false;
    return visibleFriends.every((u) => selectedRecipientIds.includes(u.id));
  }, [visibleFriends, selectedRecipientIds]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedRecipientIds([]);
    } else {
      setSelectedRecipientIds(visibleFriends.map((u) => u.id));
    }
  }, [allVisibleSelected, visibleFriends]);

  const handleMessageIconClick = async () => {
    // linkPreviewが設定されている場合の処理
    if (linkPreview) {
      const fullMessage =
        linkPreview.url + (linkComment ? ` ${linkComment}` : "");
      setSelectedMessage(fullMessage);
      setSelectedMessageLinkData({
        url: linkPreview.url,
        title: linkPreview.title,
        image: linkPreview.image,
      });
      setIsInputMode(false);
      setStep("select-recipients");
      return;
    }

    if (isInputMode && inputMessage.trim()) {
      const message = inputMessage.trim();
      setSelectedMessage(message);
      // setIsInputMode(false); // 入力モードを維持してキーボードを開いたままにする

      // 状態をリセット（重要！）
      setSelectedMessageLinkData(null);
      setLinkPreview(null);
      setLinkComment("");

      // リンク+テキストの場合は特別な処理
      const urlAndText = extractUrlAndText(message);
      if (urlAndText && urlAndText.text) {
        console.log(
          "[main] Link with text detected in handleMessageIconClick:",
          urlAndText
        );
        // リンク+テキストの場合は、リンク部分のみをメタデータ取得対象とする
        const linkMessage = urlAndText.url;
        try {
          console.log("[main] リンクメタデータを取得中:", linkMessage);
          const cacheBuster = Date.now() + Math.random();
          const res = await fetch(
            `/api/link-preview?url=${encodeURIComponent(
              linkMessage
            )}&t=${cacheBuster}`
          );
          if (res.ok) {
            const data = await res.json();
            console.log("[main] 取得したメタデータ:", data);
            const linkData = {
              url: data.url || linkMessage,
              title: data.title || linkMessage,
              image: data.image,
            };
            setSelectedMessageLinkData(linkData);
            console.log("[main] リンクメタデータ設定完了:", linkData);
          }
        } catch (error) {
          console.error("[main] リンクメタデータ取得エラー:", error);
        }
        setStep("select-recipients");
        return;
      }

      // 通常のリンクの場合はメタデータを取得してから次のステップに進む
      if (message.startsWith("http")) {
        try {
          console.log("[main] リンクメタデータを取得中:", message);
          const cacheBuster = Date.now() + Math.random();
          const res = await fetch(
            `/api/link-preview?url=${encodeURIComponent(
              message
            )}&t=${cacheBuster}`
          );
          if (res.ok) {
            const data = await res.json();
            console.log("[main] 取得したメタデータ:", data);
            const linkData = {
              url: data.url || message,
              title: data.title || message,
              image: data.image,
            };
            setSelectedMessageLinkData(linkData);
            console.log("[main] メタデータ設定完了:", linkData);
          } else {
            console.log("[main] メタデータ取得失敗:", res.status);
            // メタデータ取得に失敗した場合でも、空のデータを設定
            const fallbackData = {
              url: message,
              title: message,
              image: undefined,
            };
            setSelectedMessageLinkData(fallbackData);
            console.log(
              "[main] フォールバックメタデータ設定完了:",
              fallbackData
            );
          }
        } catch (error) {
          console.error("リンクプレビュー取得エラー:", error);
          // エラーの場合でも、空のデータを設定
          const errorData = {
            url: message,
            title: message,
            image: undefined,
          };
          setSelectedMessageLinkData(errorData);
          console.log("[main] エラー時メタデータ設定完了:", errorData);
        }
      }

      setStep("select-recipients");
    } else if (selectedMessage) {
      setStep("select-recipients");
    } else if (!selectedMessage && selectedRecipientIds.length > 0) {
      // メッセージが未選択で送信先が選択されている場合、メッセージリストに遷移
      setStep("select-message");
    }
  };

  // 送信
  const handleSend = useCallback(async () => {
    console.log("[main] handleSend called:", {
      selectedMessage,
      selectedRecipientIds: selectedRecipientIds.length,
      currentUserId,
      isSending,
    });

    if (!selectedMessage) {
      console.log("[main] No selected message");
      return;
    }
    if (selectedRecipientIds.length === 0) {
      console.log("[main] No recipients selected");
      setStep("select-recipients");
      return;
    }
    if (!currentUserId || isSending) {
      console.log("[main] Cannot send:", { currentUserId, isSending });
      return;
    }

    // リンク+テキストの場合の処理
    let messageToSend = selectedMessage;
    let finalLinkData = selectedMessageLinkData;

    // リンクプレビューが送信待機バーに表示されている場合の処理
    if (linkPreview && !selectedMessage) {
      // リンクプレビューから送信する場合
      messageToSend = linkPreview.url + (linkComment ? ` ${linkComment}` : "");
      finalLinkData = {
        url: linkPreview.url,
        title: linkPreview.title,
        image: linkPreview.image,
      };
      console.log("[main] Sending from linkPreview:", {
        messageToSend,
        finalLinkData,
      });
    } else {
      // 通常のメッセージ送信処理
      const urlAndText = extractUrlAndText(selectedMessage);
      console.log("[main] URL and text analysis:", {
        selectedMessage,
        urlAndText,
        selectedMessageLinkData,
      });

      if (urlAndText && urlAndText.text) {
        // リンク+テキストの場合は、そのまま送信
        messageToSend = selectedMessage;
        console.log("[main] Link with text message:", messageToSend);
        console.log(
          "[main] Using selectedMessageLinkData:",
          selectedMessageLinkData
        );

        // メタデータが設定されていない場合は再取得
        if (!selectedMessageLinkData || !selectedMessageLinkData.title) {
          console.log("[main] メタデータが未設定、再取得中...");
          try {
            const res = await fetch(
              `/api/link-preview?url=${encodeURIComponent(urlAndText.url)}`
            );
            if (res.ok) {
              const data = await res.json();
              finalLinkData = {
                url: data.url || urlAndText.url,
                title: data.title || urlAndText.url,
                image: data.image,
              };
              setSelectedMessageLinkData(finalLinkData);
              console.log("[main] メタデータ再取得完了:", finalLinkData);
            }
          } catch (error) {
            console.error("[main] メタデータ再取得エラー:", error);
          }
        }
      } else if (
        selectedMessage.startsWith("http") &&
        (!selectedMessageLinkData || !selectedMessageLinkData.title)
      ) {
        // 通常のリンクの場合、メタデータが設定されているか確認
        console.log("[main] 送信前メタデータ再取得:", selectedMessage);
        try {
          const res = await fetch(
            `/api/link-preview?url=${encodeURIComponent(selectedMessage)}`
          );
          if (res.ok) {
            const data = await res.json();
            finalLinkData = {
              url: data.url || selectedMessage,
              title: data.title || selectedMessage,
              image: data.image,
            };
            setSelectedMessageLinkData(finalLinkData);
            console.log("[main] 送信前メタデータ再取得完了:", finalLinkData);
          }
        } catch (error) {
          console.error("[main] 送信前メタデータ再取得エラー:", error);
        }
      }

      setIsSending(true);
      const recipientsToSend = [...selectedRecipientIds];

      try {
        // /api/match-message 内でPresetMessageの処理を行うため、
        // ここでは事前のPresetMessage作成やカウント増加は行わない

        // 送信先ごとにショートカットIDをマッピング
        const shortcutIdMap: Record<string, string | null> = {};
        recipientsToSend.forEach((receiverId) => {
          // この送信先がどのショートカットのメンバーかを確認
          const shortcut = shortcuts.find((s) =>
            s.members.some((m) => m.memberId === receiverId)
          );
          shortcutIdMap[receiverId] = shortcut?.id || null;
        });

        const requestData = {
          senderId: currentUserId,
          receiverIds: recipientsToSend,
          message: messageToSend,
          linkTitle: finalLinkData?.title,
          linkImage: finalLinkData?.image,
          shortcutIdMap: shortcutIdMap, // 送信先ごとのショートカットID
        };

        console.log("[main] 送信データ:", {
          requestData,
          finalLinkData,
          selectedMessageLinkData,
          urlAndText,
          isLink: messageToSend.startsWith("http"),
        });
        const matchResponse = await axios.post(
          "/api/match-message",
          requestData
        );

        // 送信成功時のみ送信アニメーションを表示
        setSentMessageInfo({
          message: messageToSend,
          recipients: [...selectedRecipientIds],
        });
        setIsSent(true);

        // UI リセット（入力モードは維持）
        setSelectedMessage(null);
        setSelectedRecipientIds([]);
        setSelectedShortcutIds(new Set());
        setStep("select-message");
        // setIsInputMode(false); // 入力モードを維持してキーボードを開いたままにする
        setInputMessage(""); // 入力フィールドはクリア
        setSelectedMessageLinkData(null);
        setLinkPreview(null);
        setLinkComment("");

        // 成立 → 自分側も即キューに積む（後送/先送どちらでも）
        if (matchResponse.data.message === "Match created!") {
          const matchedUserId = recipientsToSend.find(
            (id) => matchResponse.data.matchedUserId === id
          );
          if (matchedUserId) {
            const matchedUser = users.find((u) => u.id === matchedUserId);
            if (matchedUser) {
              const selfItem: MatchQueueItem = {
                matchedAt: new Date().toISOString(),
                message: messageToSend,
                matchedUser: { id: matchedUser.id, name: matchedUser.name },
                chatId: matchResponse.data.chatId,
              };
              setMatchQueue((prev) => mergeQueue(prev, [selfItem]));
            }
          }
          await Promise.all([
            fetchPresetMessages(),
            fetchChatList(currentUserId),
          ]);
        } else {
          // マッチが成立しなかった場合でもマッチメッセージリストを更新
          await fetchPresetMessages();
        }

        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        setTimeout(() => {
          setIsSent(false);
          setSentMessageInfo(null);
        }, 4000);
      } catch (error) {
        console.error("送信エラー:", error);

        // 非表示キーワードが検出された場合
        if (
          axios.isAxiosError(error) &&
          error.response?.data?.error === "hidden_keyword_detected"
        ) {
          // 送信アニメーションを表示せず、エラー通知を表示
          setErrorNotification({
            isVisible: true,
            message: t("main.hiddenKeywordError"),
          });
        } else {
          // その他のエラーの場合
          setErrorNotification({
            isVisible: true,
            message: t("main.sendError"),
          });
        }
      } finally {
        setIsSending(false);
      }
    }
  }, [
    selectedMessage,
    selectedRecipientIds,
    currentUserId,
    isSending,
    selectedMessageLinkData,
    fetchChatList,
    fetchPresetMessages,
    linkComment,
    linkPreview,
    users,
    shortcuts,
  ]);

  const canSend =
    (!!selectedMessage || !!linkPreview) && selectedRecipientIds.length > 0;

  // レイアウト定数
  const HEADER_H = 150;
  const GAP_AFTER_HEADER = -10;
  const SEND_BAR_TOTAL_H = 80;
  const SEND_BAR_TOP = HEADER_H + GAP_AFTER_HEADER;
  const LIST_PT = SEND_BAR_TOP + SEND_BAR_TOTAL_H - 32;

  // ポップアップを閉じたとき：先頭を剥がし、しきい値を進める
  const handleClosePopup = useCallback(() => {
    if (!queueHead) return;

    // 表示済みマッチとして記録
    if (currentUserId) {
      addShownMatch(currentUserId, keyOf(queueHead));
    }

    setMatchQueue((prev) => prev.slice(1));
    if (lastSeenKey) {
      const prevSeen = localStorage.getItem(lastSeenKey);
      const maxSeen = [
        prevSeen ?? "1970-01-01T00:00:00.000Z",
        queueHead.matchedAt,
      ]
        .sort()
        .slice(-1)[0];
      localStorage.setItem(lastSeenKey, maxSeen);
    }
  }, [queueHead, currentUserId, lastSeenKey]);

  // チャットへ遷移するハンドラー
  const handleGoToChat = useCallback(() => {
    if (queueHead?.chatId) {
      router.push(`/chat/${queueHead.chatId}`);
      handleClosePopup(); // 通知を閉じる
    }
  }, [queueHead?.chatId, router, handleClosePopup]);

  return (
    <>
      {/* ヘッダー（高さ拡張） */}
      <div
        className="fixed top-0 left-0 w-full bg-white z-20 px-6 pt-4 pb-4 flex flex-col items-center rounded-b-3xl"
        style={{ minHeight: HEADER_H, height: HEADER_H }}
      >
        <div className="flex w-full justify-between items-center mb-2">
          <div className="w-20 flex items-center">
            <button
              onClick={handleHistoryNavigation}
              className="transition-transform duration-200 ease-out active:scale-125 focus:outline-none rounded-full p-2"
            >
              <Image
                src="/icons/history.png"
                alt="Notifications"
                width={28}
                height={28}
                className="cursor-pointer"
              />
            </button>
          </div>
          <h1
            onClick={toggleLanguage}
            className="text-xl font-extrabold text-black tracking-tight whitespace-nowrap cursor-pointer hover:opacity-70 transition-opacity"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Happy Ice Cream
          </h1>
          <div className="w-20 flex items-center justify-end">
            <button
              onClick={() => router.push("/friends")}
              className="relative transition-transform duration-200 ease-out active:scale-125 focus:outline-none rounded-full p-2"
            >
              <Image
                src="/icons/friends.png"
                alt="ともだち認証"
                width={28}
                height={28}
                className="cursor-pointer"
              />
              {hasNewUsers && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">新</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {friends.size === 0 ? (
          <p className="text-[15px] text-gray-700 text-center leading-snug mt-1 font-medium">
            {t("main.matchWithin24h")}
            <br />
            {t("main.selectWordsAndPerson")}
            <br />
            {t("main.firstFollow")}
            <span className="text-black font-bold">{t("main.follow")}</span>
            {t("main.followToRegister")}
          </p>
        ) : (
          <p className="text-[15px] text-gray-700 text-center leading-snug mt-1 font-medium">
            {t("main.matchWithin24h")}
            <br />
            {t("main.selectWordsAndPerson")}
            <br />
            {t("main.registeredFriends", { n: friends.size })}
          </p>
        )}
      </div>

      {/* 送信待機バー（ヘッダー直下より少し下） */}
      <div
        className={`fixed left-4 right-4 z-30 py-2 flex items-center h-16 px-3 rounded-2xl backdrop-blur-sm ${
          canSend ? "bg-black" : "bg-white/90"
        }`}
        style={{ top: `${SEND_BAR_TOP}px` }}
      >
        <div className="flex-1 flex flex-col justify-center h-full overflow-x-auto pr-2">
          {!selectedMessage ||
          !messageOptions.some((m) => m.content === selectedMessage) ? (
            // リンクプレビューがある場合はプレビューを表示、ない場合は入力フィールド
            linkPreview ? (
              <div className="flex items-center gap-2 flex-1">
                {/* リンクプレビュー */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {linkPreview.image ? (
                    <Image
                      src={linkPreview.image}
                      alt={linkPreview.title}
                      width={48}
                      height={48}
                      className="w-12 h-12 object-cover rounded-lg border border-gray-300 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-600 font-bold text-xs flex-shrink-0">
                      {linkPreview.title && linkPreview.title !== "Google Maps"
                        ? "URL"
                        : "🗺️"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {linkPreview.title}
                    </p>
                  </div>
                </div>
                {/* バツボタン */}
                <button
                  onClick={() => {
                    // リンクプレビューと関連する全ての状態をクリア
                    setLinkPreview(null);
                    setLinkComment("");
                    setSelectedMessage(null);
                    setSelectedMessageLinkData(null);
                    setSelectedMessageContent(null);
                    setInputMessage("");
                    // setIsInputMode(false); // 入力モードを維持してキーボードを開いたままにする
                    setSelectedRecipientIds([]);
                    setStep("select-message");
                  }}
                  className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                >
                  <span className="text-gray-600 text-sm font-bold">✕</span>
                </button>
                {/* コメント入力フィールド */}
                <input
                  type="text"
                  value={linkComment}
                  onChange={(e) => {
                    // コメントだけを更新（linkPreviewには触らない）
                    setLinkComment(e.target.value);
                  }}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => {
                    setIsComposing(false);
                  }}
                  placeholder="コメントを追加..."
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-base bg-white focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isComposing) {
                      // キーボードを閉じないようにblur()を呼ばない
                      // e.currentTarget.blur();
                    }
                  }}
                />
              </div>
            ) : (
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={t("main.inputMessage")}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-300 text-base bg-white focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputMessage.trim()) {
                    setSelectedMessage(inputMessage.trim());
                    // setIsInputMode(false); // 入力モードを維持してキーボードを開いたままにする
                    setStep("select-recipients");
                  }
                }}
                onBlur={() => {
                  if (inputMessage.trim()) {
                    setSelectedMessage(inputMessage.trim());
                    // setIsInputMode(false); // 入力モードを維持してキーボードを開いたままにする
                    setStep("select-recipients");
                  }
                }}
              />
            )
          ) : selectedMessageLinkData ? (
            // リンクの場合はプレビュー形式で表示（編集できない）
            <div
              className={`flex items-center px-3 py-2 rounded-xl border h-[48px] ${
                canSend ? "border-gray-600" : "border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                {selectedMessageLinkData.image ? (
                  <Image
                    src={selectedMessageLinkData.image}
                    alt={selectedMessageLinkData.title}
                    width={48}
                    height={48}
                    className="w-12 h-12 object-cover rounded-lg border border-gray-300 flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove(
                        "hidden"
                      );
                    }}
                  />
                ) : null}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    selectedMessageLinkData.image ? "hidden" : ""
                  } ${
                    canSend
                      ? "bg-gray-700 border border-gray-600 text-gray-300"
                      : "bg-gray-100 border border-gray-300 text-gray-600"
                  }`}
                >
                  {selectedMessageLinkData.image
                    ? "URL"
                    : selectedMessageLinkData.title &&
                      selectedMessageLinkData.title !== "Google Maps"
                    ? "🗺️"
                    : "no photo"}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-bold truncate ${
                      canSend ? "text-white" : "text-black"
                    }`}
                  >
                    {selectedMessageLinkData.title}
                  </p>
                  <p
                    className={`text-xs truncate ${
                      canSend ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {selectedMessage}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // 通常のメッセージの場合は編集可能な入力欄
            <input
              type="text"
              value={selectedMessage || ""}
              onChange={(e) => {
                setSelectedMessage(e.target.value);
              }}
              className={`flex-1 px-3 py-2 rounded-xl border text-base focus:outline-none ${
                canSend
                  ? "bg-transparent text-white border-gray-600 placeholder-gray-400"
                  : "bg-white text-black border-gray-300"
              }`}
              placeholder="メッセージを編集"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        {selectedRecipientIds.length > 0 && (
          <span
            onClick={() => {
              setSelectedRecipientIds([]);
            }}
            className="ml-2 px-2 py-1 rounded-full bg-black text-white text-xs font-bold shadow cursor-pointer hover:bg-gray-800 transition select-none"
          >
            {selectedRecipientIds.length}人
          </span>
        )}

        <button
          onClick={canSend ? handleSend : handleMessageIconClick}
          className="flex-none p-0 transition-transform duration-200 ease-out active:scale-125 focus:outline-none"
          disabled={isSending}
          style={{ minWidth: 28, minHeight: 28 }}
        >
          <Image
            src={canSend ? "/icons/send.png" : "/icons/message.png"}
            alt="send"
            width={28}
            height={28}
            className={canSend ? "brightness-0 invert" : ""}
          />
        </button>
      </div>

      {/* リンクアクションメニュー */}
      {showLinkActionMenu && selectedMessageLinkData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              {selectedMessageLinkData.image ? (
                <Image
                  src={selectedMessageLinkData.image}
                  alt={selectedMessageLinkData.title}
                  width={64}
                  height={64}
                  className="w-16 h-16 object-cover rounded-xl border border-orange-200"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextElementSibling?.classList.remove(
                      "hidden"
                    );
                  }}
                />
              ) : null}
              <div
                className={`w-12 h-12 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs ${
                  selectedMessageLinkData.image ? "hidden" : ""
                }`}
              >
                {selectedMessageLinkData.image
                  ? "URL"
                  : selectedMessageLinkData.title &&
                    selectedMessageLinkData.title !== "Google Maps"
                  ? "🗺️"
                  : "no photo"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">
                  {selectedMessageLinkData.title}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {selectedMessageContent || selectedMessageLinkData.url}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleLinkAction("open")}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition"
              >
                リンク先へ
              </button>
              <button
                onClick={() => handleLinkAction("select")}
                className="w-full bg-orange-200 hover:bg-orange-300 text-orange-800 font-bold py-3 px-4 rounded-xl transition"
              >
                {t("main.selectThisLink")}
              </button>
              <button
                onClick={() => setShowLinkActionMenu(false)}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 px-4 rounded-xl transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* コンテンツ（スワイプ可能） */}
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden bg-white"
        style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Step 2: Pull to Refresh表示（アニメーション付き） */}
        <div className="relative z-50">
          <PullToRefreshIndicator />
        </div>
        <div
          className="flex w-full h-full transition-transform duration-300 will-change-transform"
          style={{
            transform:
              step === "select-message"
                ? "translateX(0%)"
                : "translateX(-100%)",
          }}
        >
          {/* メッセージ選択（最新順） */}
          <div
            className="basis-full flex-none box-border text-lg overflow-y-auto px-4 pb-[40px]"
            style={{
              maxHeight: "calc(100dvh - 160px)",
              paddingTop: `${LIST_PT}px`,
            }}
          >
            <div className="flex flex-col gap-3">
              {allMessageOptions.map((msg) => {
                // リンクプレビューは送信待機バーに表示するため、ここでは表示しない
                if (
                  false &&
                  (msg as PresetMessage & { isLinkPreview?: boolean })
                    .isLinkPreview
                ) {
                  const linkData = (
                    msg as PresetMessage & {
                      linkData: {
                        url: string;
                        title: string;
                        image?: string;
                      };
                    }
                  ).linkData;
                  return (
                    <button
                      key={msg.id}
                      onClick={() => {
                        setSelectedMessageLinkData(linkData);
                        handleSelectMessage(msg.content, linkData);
                      }}
                      className={`w-full flex items-center gap-3 text-left px-5 py-3 rounded-2xl hover:bg-gray-100 active:scale-95 font-medium text-base ${
                        selectedMessage === msg.content
                          ? "font-black text-black bg-gray-100"
                          : "font-normal text-gray-700 bg-white"
                      }`}
                      style={{
                        backgroundColor:
                          selectedMessage === msg.content
                            ? "#f3f4f6"
                            : "#ffffff",
                        borderColor:
                          selectedMessage === msg.content
                            ? "#ea580c"
                            : "#fed7aa",
                      }}
                    >
                      {linkData.image ? (
                        <Image
                          src={linkData.image as string}
                          alt={linkData.title}
                          width={64}
                          height={64}
                          className="w-16 h-16 object-cover rounded-xl border border-orange-200"
                          onError={(e) => {
                            console.log("Image load error:", linkData.image);
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove(
                              "hidden"
                            );
                          }}
                          onLoad={() => {
                            console.log(
                              "Image loaded successfully:",
                              linkData.image
                            );
                          }}
                        />
                      ) : null}
                      <div
                        className={`w-12 h-12 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs ${
                          linkData.image ? "hidden" : ""
                        }`}
                      >
                        {linkData.image
                          ? "URL"
                          : linkData.title && linkData.title !== "Google Maps"
                          ? "🗺️"
                          : "no photo"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800">
                          {linkData.title}
                        </p>
                        <p className="text-xs text-orange-600 mt-1">
                          {t("main.selectThisLink")}
                        </p>
                      </div>
                    </button>
                  );
                }

                // 通常のメッセージの場合（リンクメタデータがある場合はプレビュー形式）
                const hasLinkMetadata = msg.linkTitle || msg.linkImage;

                if (hasLinkMetadata) {
                  // リンクメタデータがある場合のプレビュー表示
                  return (
                    <button
                      key={msg.id}
                      onClick={() => {
                        // 状態をリセット（重要！）
                        setSelectedMessageLinkData(null);
                        setLinkPreview(null);
                        setLinkComment("");

                        // リンク+テキストの場合はURL部分のみを抽出
                        console.log(
                          "[handleMessageIconClick] msg.content:",
                          msg.content
                        );
                        const urlMatch = msg.content.match(
                          /^(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/
                        );
                        const urlOnly = urlMatch ? urlMatch[1] : msg.content;
                        console.log(
                          "[handleMessageIconClick] urlMatch:",
                          urlMatch
                        );
                        console.log(
                          "[handleMessageIconClick] urlOnly:",
                          urlOnly
                        );

                        const linkData = {
                          url: urlOnly,
                          title: msg.linkTitle || msg.content,
                          image: msg.linkImage || undefined,
                        };
                        console.log(
                          "[handleMessageIconClick] linkData:",
                          linkData
                        );
                        setSelectedMessageLinkData(linkData);
                        setSelectedMessageContent(msg.content);
                        handleSelectMessage(msg.content, linkData);
                      }}
                      className={`w-full flex items-center gap-3 text-left px-5 py-4 rounded-2xl hover:bg-gray-50 font-medium text-base border-2 shadow-sm hover:shadow-md ${
                        selectedMessage === msg.content
                          ? "font-black text-black bg-gray-100 border-black shadow-md"
                          : "font-normal text-gray-700 bg-white border-gray-200"
                      }`}
                      style={{
                        backgroundColor:
                          selectedMessage === msg.content
                            ? "#f3f4f6"
                            : "#ffffff",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        {msg.linkTitle &&
                        (msg.content.includes(" ") ||
                          msg.content.includes("　") ||
                          msg.content.match(
                            /^(https?:\/\/[a-zA-Z0-9\-._~:\/?#[\]@!$&'()*+,;=%]+)([^a-zA-Z0-9\-._~:\/?#[\]@!$&'()*+,;=%].+)$/
                          )) ? (
                          // リンク+テキストの場合
                          <>
                            <p className="text-base font-medium text-gray-800 truncate">
                              <TranslatedMessage
                                text={msg.content
                                  .replace(
                                    /^(https?:\/\/[a-zA-Z0-9\-._~:\/?#[\]@!$&'()*+,;=%]+)/,
                                    ""
                                  )
                                  .trim()}
                                sourceLang="ja"
                              />
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                              {msg.linkTitle}
                            </p>
                          </>
                        ) : (
                          // 通常のリンクまたはテキストの場合
                          <>
                            <p className="text-sm font-bold text-gray-800">
                              {msg.linkTitle || (
                                <TranslatedMessage
                                  text={msg.content}
                                  sourceLang="ja"
                                />
                              )}
                            </p>
                          </>
                        )}
                        <div className="flex gap-1 mt-1">
                          {msg.senderCount > 2 && (
                            <p className="text-xs text-black font-medium">
                              {t("main.peopleSent", { n: msg.senderCount })}
                            </p>
                          )}
                          <p className="text-xs text-gray-400">
                            {formatLastSentAt(msg.lastSentAt, t)}
                          </p>
                        </div>
                      </div>
                      {msg.linkImage ? (
                        <Image
                          src={msg.linkImage}
                          alt={msg.linkTitle || msg.content}
                          width={40}
                          height={40}
                          className="w-10 h-10 object-cover rounded-lg border border-orange-200 flex-shrink-0"
                          onError={(e) => {
                            console.log("Image load error:", msg.linkImage);
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextElementSibling?.classList.remove(
                              "hidden"
                            );
                          }}
                          onLoad={() => {
                            console.log(
                              "Image loaded successfully:",
                              msg.linkImage
                            );
                          }}
                        />
                      ) : (
                        <div
                          className={`w-8 h-8 rounded-lg bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-xs flex-shrink-0`}
                        >
                          {msg.linkImage
                            ? "URL"
                            : msg.linkTitle && msg.linkTitle !== "Google Maps"
                            ? "🗺️"
                            : "no photo"}
                        </div>
                      )}
                    </button>
                  );
                }

                // 通常のテキストメッセージの場合
                return (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg.content)}
                    className={`w-full flex flex-col text-left px-5 py-4 rounded-2xl hover:bg-gray-50 font-medium text-base border-2 shadow-sm hover:shadow-md ${
                      selectedMessage === msg.content
                        ? "font-black text-black bg-gray-100 border-black shadow-md"
                        : "font-normal text-gray-700 bg-white border-gray-200"
                    }`}
                    style={{
                      backgroundColor:
                        selectedMessage === msg.content ? "#f3f4f6" : "#ffffff",
                    }}
                  >
                    <TranslatedMessage
                      text={msg.content}
                      sourceLang="ja"
                      className={`whitespace-pre-wrap break-words ${
                        selectedMessage === msg.content ? "font-black" : ""
                      }`}
                    />
                    <div className="flex gap-1 items-center mt-2">
                      {msg.senderCount > 2 && (
                        <span className="text-xs text-black font-medium">
                          {t("main.peopleSent", { n: msg.senderCount })}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {formatLastSentAt(msg.lastSentAt, t)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 送信先選択 */}
          <div
            className="basis-full flex-none box-border text-lg overflow-y-auto px-4 pb-[40px]"
            style={{
              maxHeight: "calc(100dvh - 160px)",
              paddingTop: `${LIST_PT}px`,
            }}
          >
            {/* 検索バー（一番上に配置） */}
            <div className="mb-3 relative">
              <input
                type="text"
                placeholder={t("main.searchByName")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-full focus:ring-2 focus:ring-gray-400 focus:border-gray-400 outline-none text-base bg-white"
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

            {/* ショートカット作成ボタン */}
            <div className="mb-3">
              <button
                onClick={() => setShowShortcutCreateModal(true)}
                className="w-full py-3 rounded-xl text-base font-bold border-2 border-dashed border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ＋ {t("main.createShortcut")}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {/* ショートカット一覧（検索中は非表示） */}
              {!debouncedSearchQuery && shortcuts.length > 0 && (
                <>
                  {shortcuts.map((shortcut) => {
                    const isShortcutSelected = selectedShortcutIds.has(
                      shortcut.id
                    );

                    // ショートカットは明示的に選択された場合のみ選択状態にする
                    // 個人を個別に選択した場合は、ショートカットは選択状態にならない
                    const allSelected = isShortcutSelected;
                    const someSelected = false; // 個人選択時にはショートカットは選択状態にしない

                    return (
                      <button
                        key={shortcut.id}
                        onClick={(e) => {
                          // 長押しが発動した場合はクリックを無効化
                          if (isLongPressTriggered) {
                            e.preventDefault();
                            return;
                          }
                          toggleShortcut(shortcut);
                        }}
                        onTouchStart={() => {
                          handleShortcutTouchStart(shortcut);
                        }}
                        onTouchEnd={handleShortcutTouchEnd}
                        onTouchCancel={handleShortcutTouchCancel}
                        onMouseDown={(e) => {
                          // マウスでも長押しを検出（右クリックは別処理）
                          if (e.button === 0) {
                            setIsLongPressTriggered(false);
                            const timer = setTimeout(() => {
                              setIsLongPressTriggered(true);
                              setSelectedShortcut(shortcut);
                              setShowShortcutEditModal(true);
                            }, 500);
                            setLongPressTimer(timer);
                            const handleMouseUp = () => {
                              if (timer) clearTimeout(timer);
                              setLongPressTimer(null);
                              setTimeout(() => {
                                setIsLongPressTriggered(false);
                              }, 100);
                              document.removeEventListener(
                                "mouseup",
                                handleMouseUp
                              );
                            };
                            document.addEventListener("mouseup", handleMouseUp);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedShortcut(shortcut);
                          setShowShortcutEditModal(true);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer border-l-4 text-left relative ${
                          allSelected
                            ? "bg-gray-50 border-l-black shadow-md"
                            : someSelected
                            ? "bg-gray-50/70 border-l-gray-600 shadow-sm"
                            : "bg-gray-50/50 border-l-gray-400 shadow-sm hover:shadow-md hover:bg-gray-50"
                        }`}
                        style={{
                          borderRight: allSelected
                            ? "2px solid #000"
                            : someSelected
                            ? "2px solid #9ca3af"
                            : "2px solid #e5e7eb",
                          borderTop: allSelected
                            ? "2px solid #000"
                            : someSelected
                            ? "2px solid #9ca3af"
                            : "2px solid #e5e7eb",
                          borderBottom: allSelected
                            ? "2px solid #000"
                            : someSelected
                            ? "2px solid #9ca3af"
                            : "2px solid #e5e7eb",
                        }}
                      >
                        {/* アイコン */}
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow text-xs"
                          style={{
                            backgroundColor: getShortcutBgColor(shortcut.id),
                          }}
                        >
                          📁
                        </div>

                        {/* コンテンツ */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-lg truncate ${
                                allSelected
                                  ? "font-bold text-black"
                                  : someSelected
                                  ? "font-semibold text-gray-800"
                                  : "font-medium text-gray-700"
                              }`}
                            >
                              {shortcut.name ||
                                `${shortcut.members[0]?.memberName || ""}ほか${
                                  shortcut.memberCount - 1
                                }人`}
                            </p>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                allSelected
                                  ? "bg-gray-800 text-white"
                                  : someSelected
                                  ? "bg-gray-600 text-white"
                                  : "bg-gray-300 text-gray-700"
                              }`}
                            >
                              {shortcut.memberCount}人
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {t("main.shortcut")}
                          </p>
                        </div>

                        {/* チェックマーク */}
                        {(allSelected || someSelected) && (
                          <div className="relative z-10">
                            <Image
                              src="/icons/check.png"
                              alt="Selected"
                              width={20}
                              height={20}
                            />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* 検索結果が0件の場合のメッセージ */}
              {debouncedSearchQuery && visibleFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-gray-500 text-base">
                    該当するユーザーが見つかりませんでした
                  </p>
                </div>
              ) : visibleFriends.length === 0 && !debouncedSearchQuery ? (
                <div
                  onClick={() => router.push("/friends")}
                  className="flex flex-col items-center justify-center py-12 px-6 rounded-3xl border border-orange-200 bg-white cursor-pointer hover:bg-orange-50 transition-colors"
                >
                  <Image
                    src="/icons/friends.png"
                    alt="フォロー"
                    width={48}
                    height={48}
                    className="mb-4"
                  />
                  <p className="text-lg font-bold text-black text-center">
                    {t("main.followUp")}
                  </p>
                </div>
              ) : (
                visibleFriends.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleRecipient(u.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-gray-50 cursor-pointer border-2 shadow-sm hover:shadow-md text-left ${
                      selectedRecipientIds.includes(u.id)
                        ? "bg-gray-100 border-black shadow-md"
                        : "bg-white border-gray-200"
                    }`}
                    style={{
                      backgroundColor: selectedRecipientIds.includes(u.id)
                        ? "#f3f4f6"
                        : "#ffffff",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow"
                      style={{ backgroundColor: getBgColor(u.name) }}
                    >
                      {getInitials(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-lg truncate ${
                          selectedRecipientIds.includes(u.id)
                            ? "font-bold text-black"
                            : "text-gray-700"
                        }`}
                      >
                        {u.name}
                      </p>
                      {u.bio && (
                        <p className="text-sm text-gray-600 truncate">
                          {u.bio}
                        </p>
                      )}
                    </div>
                    {selectedRecipientIds.includes(u.id) && (
                      <Image
                        src="/icons/check.png"
                        alt="Selected"
                        width={20}
                        height={20}
                      />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* リスト切替トグル */}
      <div
        className="fixed left-4 right-4 z-30 bg-gray-50 py-1 px-1 rounded-2xl border border-gray-200 shadow-sm backdrop-blur-sm"
        style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-1">
          <button
            onClick={() => setStep("select-message")}
            className={`flex-1 py-2.5 text-center text-sm rounded-xl font-bold transition-all ${
              step === "select-message"
                ? "bg-white text-black shadow-sm border border-gray-200"
                : "bg-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("main.matchMessage")}
          </button>
          <button
            onClick={() => setStep("select-recipients")}
            className={`flex-1 py-2.5 text-center text-sm rounded-xl font-bold transition-all ${
              step === "select-recipients"
                ? "bg-white text-black shadow-sm border border-gray-200"
                : "bg-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t("main.recipientList")}
          </button>
        </div>
      </div>

      {/* 送信成功メッセージ */}
      {isSent && sentMessageInfo && (
        <div className="fixed top-[50px] left-0 right-0 z-30 overflow-hidden px-2 neon-gradient">
          <div className="w-max whitespace-nowrap animate-slide-in font-bold text-white text-lg px-4 py-2">
            {t("main.messageSentTo", {
              message: sentMessageInfo.message,
              recipients: sentMessageInfo.recipients
                .map((id) => users.find((u) => u.id === id)?.name)
                .filter(Boolean)
                .join(", "),
            })}
          </div>
        </div>
      )}

      {/* マッチ通知（キュー先頭だけ表示） */}
      <MatchNotification
        isVisible={isPopupVisible}
        onClose={handleClosePopup}
        onGoToChat={handleGoToChat}
        matchedUser={queueHead?.matchedUser ?? undefined}
        message={queueHead?.message ?? undefined}
        chatId={queueHead?.chatId}
      />

      {/* エラー通知 */}
      <ErrorNotification
        isVisible={errorNotification.isVisible}
        message={errorNotification.message}
        onClose={() => setErrorNotification({ isVisible: false, message: "" })}
      />

      {/* ショートカット作成モーダル */}
      {currentUserId && (
        <ShortcutCreateModal
          isOpen={showShortcutCreateModal}
          onClose={() => setShowShortcutCreateModal(false)}
          onSuccess={handleShortcutCreateSuccess}
          userId={currentUserId}
          friends={visibleFriends.map((u) => ({
            id: u.id,
            name: u.name,
            bio: u.bio || null,
          }))}
        />
      )}

      {/* ショートカット編集モーダル */}
      {currentUserId && (
        <ShortcutEditModal
          isOpen={showShortcutEditModal}
          onClose={() => {
            setShowShortcutEditModal(false);
            setSelectedShortcut(null);
          }}
          onSuccess={handleShortcutUpdateSuccess}
          onDelete={handleShortcutDeleteSuccess}
          userId={currentUserId}
          shortcut={selectedShortcut}
          friends={visibleFriends.map((u) => ({
            id: u.id,
            name: u.name,
            bio: u.bio || null,
          }))}
        />
      )}

      <FixedTabBar />
    </>
  );
}
