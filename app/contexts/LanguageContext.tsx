"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type Language = "ja" | "en";

interface LanguageContextType {
  language: Language;
  toggleLanguage: () => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// 翻訳キー定義
const translations: Record<Language, Record<string, string>> = {
  ja: {
    // 時間表示
    "time.justNow": "たった今",
    "time.minutesAgo": "{n}分前",
    "time.hoursAgo": "{n}時間前",
    "time.daysAgo": "{n}日前",
    "time.weeksAgo": "{n}週間前",
    "time.monthsAgo": "{n}ヶ月前",
    "time.yearsAgo": "{n}年前",
    
    // メイン画面
    "main.matchWithin24h": "24時間以内にマッチできるかな？",
    "main.matchHow": "同じメッセージを送り合うと初めてマッチします",
    "main.expiry24h": "マッチ：24時間以内",
    "main.expiry1week": "マッチ：1週間以内",
    "main.expiry2weeks": "マッチ：2週間以内",
    "main.selectWordsAndPerson": "ことばと相手を選んで送ってみましょう。",
    "main.firstFollow": "まずは",
    "main.follow": "フォロー",
    "main.followToRegister": "を登録してください",
    "main.selectThisLink": "このリンクをマッチメッセージとして選ぶ",
    "main.peopleSent": "{n}人が送信しました",
    "main.followUp": "フォローしましょう↑！",
    "main.matchMessage": "マッチメッセージ",
    "main.recipientList": "送信先リスト",
    "main.sentTo": "に送信されました！",
    "main.messageSentTo": "「{message}」が{recipients}に送信されました！",
    "main.sendError": "メッセージの送信に失敗しました。",
    "main.hiddenKeywordError": "非表示設定されている言葉が含まれるため、送信されませんでした。",
    "main.replySkippedWarning": "今送ったメッセージのうち、{n}件は返信にならないため送信されませんでした",
    "main.replyNotice": "返信にならない相手には送信されません。",
    "main.replyNoMessage": "返信メッセージなし",
    "main.replyDone": "完了",
    "main.replyPlaceholder": "返信を入力（空でも可）",
    "main.registeredFriends": "フォローした{n}人が誰かに送ったメッセージです👇",
    "main.weekTestMessage": "送った相手にだけ「__があなたに送りました」と表示されます。送信した相手以外には表示されないので安心してください。",
    "main.sentToYou": "があなたに送りました",
    "main.inputMessage": "メッセージを入力",
    "main.searchByName": "名前で検索...",
    "main.createShortcut": "自分だけのショートカットを作成",
    "main.shortcut": "ショートカット",
    
    // チャット画面
    "chat.matchedWords": "マッチしたことば:",
    "chat.fetchingLinkInfo": "リンク情報を取得中...",
    
    // 通知一覧
    "notifications.history": "ことばをシェアした履歴です。",
    "notifications.cancelInfo": "右のボタンから取り消すこともできます（未マッチのみ）。",
    "notifications.loading": "読み込み中…",
    "notifications.noHistory": "まだことばをシェアしたことがありません。",
    "notifications.unmatched": "まだマッチしてないことば",
    "notifications.matched": "マッチしたことば",
    "notifications.sentTogether": "同時に{n}人（マッチ済）",
    "notifications.sentTogetherUnmatched": "同時に{n}人",
    "notifications.matchedStatus": "マッチ済",
    
    // フレンド画面
    "friends.followTitle": "フォローする",
    "friends.selectToMatch": "マッチしたい人を選びましょう。",
    "friends.noNotification": "フォローしても相手には通知されません。",
    "friends.lockInfo": "一度設定を変更すると1時間ロックされます。",
    "friends.followCount": "フォロー: {n}人",
    "friends.searchPlaceholder": "名前で検索...",
    "friends.clearSearch": "検索をクリア",
    "friends.followRemove": "フォロー解除",
    "friends.followAdd": "フォロー追加",
    "friends.following": "フォロー中",
    "friends.processing": "処理中...",
    "friends.restricted": "制限中",
    "friends.followYourOwn": "フォローはあなただけのものです。",
    "friends.understand": "理解したので次からはこの通知は表示しない",
    "friends.close": "閉じる",
    "friends.followAtLeast2": "2人以上フォローしてください。",
    "friends.checkFollowStatus": "フォロー状態を確認する",
    "friends.noFollowedUsers": "フォローしているユーザーがいません",
    
    // ショートカットモーダル
    "shortcut.create": "ショートカットを作成",
    "shortcut.createDescription": "ショートカットは自分だけのもので、作成しても友だちには通知されません。",
    "shortcut.nameOptional": "ショートカット名（任意）",
    "shortcut.namePlaceholder": "名前を入力（未入力の場合は自動生成）",
    "shortcut.selectMembers": "メンバーを選択（{n}人選択中）",
    "shortcut.selectAll": "全員を選択",
    "shortcut.deselectAll": "全選択解除",
    "shortcut.creating": "作成中...",
    "shortcut.createButton": "作成",
    "shortcut.edit": "ショートカットを編集",
    "shortcut.updating": "更新中...",
    "shortcut.updateButton": "更新",
    "shortcut.delete": "削除",
    "shortcut.deleting": "削除中...",
    "shortcut.deleteConfirm": "ショートカットを削除しますか？",
    "shortcut.deleteConfirmMessage": "」を削除します。 この操作は取り消せません。",
    "shortcut.updateError": "ショートカットの更新に失敗しました",
    "shortcut.deleteError": "ショートカットの削除に失敗しました",
    "shortcut.createError": "ショートカットの作成に失敗しました",
    "shortcut.andOthers": "ほか{n}人",
    
    // プロフィール画面
    "profile.loading": "Loading...",
    "profile.saved": "変更を保存しました",
    "profile.name": "名前",
    "profile.bio": "自己紹介",
    "profile.bioNotSet": "自己紹介未設定",
    "profile.searchNames": "検索用名前（検索しやすくするための追加の名前）",
    "profile.englishName": "English Name（任意）",
    "profile.japaneseName": "Japanese Name（任意）",
    "profile.otherName": "Other（任意）",
    "profile.nameEnExample": "例: Taro Yamada",
    "profile.nameJaExample": "例: やまだたろう",
    "profile.nameOtherExample": "例: ニックネーム、別名など",
    "profile.save": "保存",
    "profile.cancel": "キャンセル",
    "profile.edit": "編集",
    "profile.changePassword": "パスワード変更",
    "profile.logout": "ログアウト",
    "profile.currentPassword": "現在のパスワード",
    "profile.newPassword": "新しいパスワード",
    "profile.confirmPassword": "新しいパスワード（確認）",
    "profile.currentPasswordPlaceholder": "現在のパスワードを入力",
    "profile.newPasswordPlaceholder": "新しいパスワードを入力",
    "profile.confirmPasswordPlaceholder": "新しいパスワードを再入力",
    "profile.change": "変更",
    "profile.logoutConfirm": "ログアウト確認",
    "profile.logoutConfirmMessage": "本当にログアウトしますか？",
    "profile.loginRequired": "ログインしてください",
    "profile.updateFailed": "プロフィールの更新に失敗しました",
    "profile.passwordMismatch": "新しいパスワードと確認パスワードが一致しません",
    "profile.passwordTooShort": "新しいパスワードは6文字以上である必要があります",
    "profile.passwordChanged": "パスワードが正常に変更されました",
    "profile.passwordChangeFailed": "パスワードの変更に失敗しました",
    
    // チャットリスト画面
    "chatList.loading": "読み込み中…",
    "chatList.noChats": "まだチャットがありません",
    "chatList.sendMessageHint": "メイン画面でメッセージを送信してみてください",
    "chatList.yesterday": "昨日",
    "chatList.notMatched": "まだマッチしていません",
    "chatList.weekDay0": "日",
    "chatList.weekDay1": "月",
    "chatList.weekDay2": "火",
    "chatList.weekDay3": "水",
    "chatList.weekDay4": "木",
    "chatList.weekDay5": "金",
    "chatList.weekDay6": "土",
    
    // 通知
    "notification.newMessage": "新規メッセージ",
    "notification.anonymousMessageFollowing": "あなた宛に匿名のメッセージが届きました（たった今）（この通知はリアルです）",
    "notification.anonymousMessageNotFollowing": "フォローしてない誰かからあなた宛に匿名のメッセージが届きました（たった今）（この通知はリアルです）",
    "notification.newChatMessage": "{name}さんから新着メッセージ",
    "notification.digestNewMessage": "新着メッセージ",
    "notification.digestUnmatchedSingle": "あなたに誰かからメッセージが来ています（24時間以内）",
    "notification.digestUnmatchedMultiple": "あなたに誰かから複数のメッセージが来ています（24時間以内）",
    "notification.digestFeedNew": "今日はこれまでに{n}件の新しいメッセージが追加されました",
    "notification.digestUserNew": "今日あなたに新しいメッセージが{n}件届きました",
    "notification.digestGlobalTitle": "きょうのことば",
    "notification.digestGlobalBody": "今日はこれまでに{n}件の新しいことばが追加されました",
    
    // マッチ通知
    "matchNotification.title": "マッチング成立！",
    "matchNotification.subtitle": "同じことばをシェアしました",
    "matchNotification.nameSuffix": "さん",
    "matchNotification.matchedWith": "とマッチしました",
    "matchNotification.sharedWords": "シェアしたことば",
    "matchNotification.close": "閉じる",
    "matchNotification.goToChat": "チャットへ",
    
    // テスト検証ポップアップ
    "testVerification.title": "比較検証実験中",
    "testVerification.description": "研究のために一週間実験を行います。\n\nメッセージを投稿したとき、送った相手にだけ「__があなたに送りました」と赤文字で表示される仕様になりました。\n\n送信した相手以外には表示されないので安心してください。\n\nぜひ使ってみて、感想を聞かせてください！",
    "testVerification.readLater": "後でもう一度読む",
    "testVerification.agree": "同意する",
  },
  en: {
    // 時間表示
    "time.justNow": "Just now",
    "time.minutesAgo": "{n} min ago",
    "time.hoursAgo": "{n} hours ago",
    "time.daysAgo": "{n} days ago",
    "time.weeksAgo": "{n} weeks ago",
    "time.monthsAgo": "{n} months ago",
    "time.yearsAgo": "{n} years ago",
    
    // メイン画面
    "main.matchWithin24h": "Can you match within 24 hours?",
    "main.selectWordsAndPerson": "Choose words and a person to send.",
    "main.firstFollow": "First, ",
    "main.follow": "follow",
    "main.followToRegister": " someone to get started",
    "main.selectThisLink": "Select this link as a match message",
    "main.peopleSent": "{n} people sent",
    "main.followUp": "Follow someone ↑!",
    "main.matchMessage": "Match Message",
    "main.recipientList": "Recipient List",
    "main.sentTo": " sent to ",
    "main.messageSentTo": "「{message}」 sent to {recipients}!",
    "main.sendError": "Failed to send message.",
    "main.hiddenKeywordError": "Message contains hidden keywords and cannot be sent.",
    "main.replySkippedWarning": "{n} recipients did not receive your reply because it was not a valid reply target.",
    "main.replyNotice": "Recipients without a matching inbound message will not receive this reply.",
    "main.replyNoMessage": "No reply message",
    "main.replyDone": "Done",
    "main.replyPlaceholder": "Enter a reply (can be empty)",
    "main.registeredFriends": "Messages sent by {n} people you follow 👇",
    "main.matchHow": "You only match when you both send the same message for the first time.",
    "main.expiry24h": "Match: within 24 hours",
    "main.expiry1week": "Match: within 1 week",
    "main.expiry2weeks": "Match: within 2 weeks",
    "main.sentToYou": " sent to you",
    "main.inputMessage": "Enter message",
    "main.searchByName": "Search by name...",
    "main.createShortcut": "Create your own shortcut",
    "main.shortcut": "Shortcut",
    
    // チャット画面
    "chat.matchedWords": "Matched words:",
    "chat.fetchingLinkInfo": "Fetching link info...",
    
    // 通知一覧
    "notifications.history": "History of shared words.",
    "notifications.cancelInfo": "You can cancel from the button on the right (unmatched only).",
    "notifications.loading": "Loading...",
    "notifications.noHistory": "You haven't shared any words yet.",
    "notifications.unmatched": "Unmatched words",
    "notifications.matched": "Matched words",
    "notifications.sentTogether": "Sent together to {n} people (matched)",
    "notifications.sentTogetherUnmatched": "Sent together to {n} people",
    "notifications.matchedStatus": "Matched",
    
    // フレンド画面
    "friends.followTitle": "Follow",
    "friends.selectToMatch": "Choose people you want to match with.",
    "friends.noNotification": "Following someone won't notify them.",
    "friends.lockInfo": "Changing settings will lock for 1 hour.",
    "friends.followCount": "Following: {n}",
    "friends.searchPlaceholder": "Search by name...",
    "friends.clearSearch": "Clear search",
    "friends.followRemove": "Unfollow",
    "friends.followAdd": "Follow",
    "friends.following": "Following",
    "friends.processing": "Processing...",
    "friends.restricted": "Restricted",
    "friends.followYourOwn": "Following is only visible to you.",
    "friends.understand": "Got it, don't show this again",
    "friends.close": "Close",
    "friends.followAtLeast2": "Please follow at least 2 people.",
    "friends.checkFollowStatus": "Check follow status",
    "friends.noFollowedUsers": "No followed users",
    
    // ショートカットモーダル
    "shortcut.create": "Create Shortcut",
    "shortcut.createDescription": "Shortcuts are only visible to you and won't notify your friends.",
    "shortcut.nameOptional": "Shortcut Name (Optional)",
    "shortcut.namePlaceholder": "Enter name (auto-generated if empty)",
    "shortcut.selectMembers": "Select Members ({n} selected)",
    "shortcut.selectAll": "Select All",
    "shortcut.deselectAll": "Deselect All",
    "shortcut.creating": "Creating...",
    "shortcut.createButton": "Create",
    "shortcut.edit": "Edit Shortcut",
    "shortcut.updating": "Updating...",
    "shortcut.updateButton": "Update",
    "shortcut.delete": "Delete",
    "shortcut.deleting": "Deleting...",
    "shortcut.deleteConfirm": "Delete this shortcut?",
    "shortcut.deleteConfirmMessage": " will be deleted. This action cannot be undone.",
    "shortcut.updateError": "Failed to update shortcut",
    "shortcut.deleteError": "Failed to delete shortcut",
    "shortcut.createError": "Failed to create shortcut",
    "shortcut.andOthers": " and {n} others",
    
    // プロフィール画面
    "profile.loading": "Loading...",
    "profile.saved": "Changes saved",
    "profile.name": "Name",
    "profile.bio": "Bio",
    "profile.bioNotSet": "Bio not set",
    "profile.searchNames": "Search Names (additional names for easier searching)",
    "profile.englishName": "English Name (Optional)",
    "profile.japaneseName": "Japanese Name (Optional)",
    "profile.otherName": "Other (Optional)",
    "profile.nameEnExample": "e.g., Taro Yamada",
    "profile.nameJaExample": "e.g., やまだたろう",
    "profile.nameOtherExample": "e.g., nickname, alias, etc.",
    "profile.save": "Save",
    "profile.cancel": "Cancel",
    "profile.edit": "Edit",
    "profile.changePassword": "Change Password",
    "profile.logout": "Logout",
    "profile.currentPassword": "Current Password",
    "profile.newPassword": "New Password",
    "profile.confirmPassword": "New Password (Confirm)",
    "profile.currentPasswordPlaceholder": "Enter current password",
    "profile.newPasswordPlaceholder": "Enter new password",
    "profile.confirmPasswordPlaceholder": "Re-enter new password",
    "profile.change": "Change",
    "profile.logoutConfirm": "Confirm Logout",
    "profile.logoutConfirmMessage": "Are you sure you want to logout?",
    "profile.loginRequired": "Please login",
    "profile.updateFailed": "Failed to update profile",
    "profile.passwordMismatch": "New password and confirmation do not match",
    "profile.passwordTooShort": "New password must be at least 6 characters",
    "profile.passwordChanged": "Password changed successfully",
    "profile.passwordChangeFailed": "Failed to change password",
    
    // チャットリスト画面
    "chatList.loading": "Loading...",
    "chatList.noChats": "No chats yet",
    "chatList.sendMessageHint": "Try sending a message from the main screen",
    "chatList.yesterday": "Yesterday",
    "chatList.notMatched": "Not matched yet",
    "chatList.weekDay0": "Sun",
    "chatList.weekDay1": "Mon",
    "chatList.weekDay2": "Tue",
    "chatList.weekDay3": "Wed",
    "chatList.weekDay4": "Thu",
    "chatList.weekDay5": "Fri",
    "chatList.weekDay6": "Sat",
    
    // 通知
    "notification.newMessage": "New Message",
    "notification.anonymousMessageFollowing": "You've just received an anonymous message specifically for you.\n\nThis notification is real.",
    "notification.anonymousMessageNotFollowing": "You've just received an anonymous message specifically for you from someone you don't follow.\n\nThis notification is real.",
    "notification.newChatMessage": "New message from {name}",
    "notification.digestNewMessage": "New Messages",
    "notification.digestUnmatchedSingle": "You have a message from someone (within 24 hours)",
    "notification.digestUnmatchedMultiple": "You have multiple messages from someone (within 24 hours)",
    "notification.digestFeedNew": "{n} new messages have been added today",
    "notification.digestUserNew": "You received {n} new messages today",
    "notification.digestGlobalTitle": "Today's Words",
    "notification.digestGlobalBody": "{n} new words have been added today",
    
    // マッチ通知
    "matchNotification.title": "Match established!",
    "matchNotification.subtitle": "You shared the same words",
    "matchNotification.nameSuffix": "",
    "matchNotification.matchedWith": "matched with you",
    "matchNotification.sharedWords": "Shared words",
    "matchNotification.close": "Close",
    "matchNotification.goToChat": "Go to Chat",
    
    // テスト検証ポップアップ
    "testVerification.title": "Comparative Verification Experiment",
    "testVerification.description": "We are conducting a one-week experiment for research purposes.\n\nWhen you post a message, only the recipient will see \"__ sent this to you\" in red text.\n\nIt will not be displayed to anyone other than the recipient, so please rest assured.\n\nPlease try it out and share your feedback!",
    "testVerification.readLater": "Read later",
    "testVerification.agree": "Agree",
  },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("ja");

  // 初期化: localStorageとDBから言語設定を読み込む
  useEffect(() => {
    const initLanguage = async () => {
      try {
        // まずlocalStorageから読み込み（即時反映）
        if (typeof window !== "undefined") {
          const storedLang = localStorage.getItem("language") as Language | null;
          if (storedLang === "ja" || storedLang === "en") {
            setLanguage(storedLang);
          }
        }

        // DBからも読み込んで同期（あれば上書き）
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (token) {
          try {
            const res = await fetch("/api/auth/profile", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              // 後方互換性: data.user.language または data.language を確認
              const userLanguage = data.user?.language || data.language;
              if (userLanguage && (userLanguage === "ja" || userLanguage === "en")) {
                setLanguage(userLanguage);
                if (typeof window !== "undefined") {
                  localStorage.setItem("language", userLanguage);
                }
              }
            }
          } catch (e) {
            console.error("Failed to load language from DB:", e);
          }
        }
      } catch (e) {
        console.error("Failed to initialize language:", e);
      }
    };

    initLanguage();
  }, []);

  // 言語切替（localStorage + DB）
  const toggleLanguage = useCallback(async () => {
    const newLang: Language = language === "ja" ? "en" : "ja";
    
    // 即時反映（localStorage）
    setLanguage(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("language", newLang);
    }

    // DBに保存（バックグラウンド）
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      try {
        await fetch("/api/auth/update-language", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ language: newLang }),
        });
      } catch (e) {
        console.error("Failed to save language to DB:", e);
        // エラーでもUIは既に切り替わっているので続行
      }
    }
  }, [language]);

  // 翻訳関数
  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const translation = translations[language][key] || key;
    if (!params) return translation;
    
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
      translation
    );
  }, [language]);

  // 初期化中でもコンテキストを提供（デフォルト値で）
  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

