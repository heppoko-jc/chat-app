# 🔍 ダイジェスト通知の診断手順

## 📋 これからやること

ダイジェスト通知が来ない原因を調べるために、2 つの API を実行します。

## 🌐 ステップ 1: 診断エンドポイントを確認

ブラウザで以下の URL にアクセスしてください：

```
https://your-domain.vercel.app/api/admin/diagnose
```

**確認できる情報：**

- 環境変数（VAPID キー）が正しく設定されているか
- プッシュ通知を登録しているユーザー数
- 過去 24 時間のメッセージ数
- 未マッチのメッセージ数
- フィード新着メッセージ数

### 結果の見方

JSON が表示されます。以下の項目をチェックしてください：

1. **environment.has_vapid_public**: `true`である必要があります
2. **environment.has_vapid_private**: `true`である必要があります
3. **push_subscriptions.total_active**: プッシュ通知を登録しているユーザー数（0 より大きい必要があります）
4. **messages.sent_messages_24h**: 過去 24 時間の送信メッセージ数（通知があるべき）
5. **unmatched_messages.unmatched_count**: 未マッチメッセージ数（通知があるべき）

## 🌐 ステップ 2: ダイジェスト API を手動実行

次に、実際のダイジェスト通知 API を手動で実行します：

```
https://your-domain.vercel.app/api/cron/digest-17
```

この API は以下を返します：

- 処理されたユーザー数
- 送信された通知数
- 無効化された購読数
- 実行時間

### 結果の見方

`stats` セクションを確認してください：

```json
{
  "ok": true,
  "message": "...",
  "stats": {
    "usersWithUnmatchedMessages": 10, // 未マッチメッセージがあるユーザー数
    "usersWithFeedNewMessages": 5, // フィード新着があるユーザー数
    "totalTargetUsers": 12, // 通知対象の総ユーザー数
    "usersNotified": 8, // 実際に通知したユーザー数
    "notificationsSent": 15, // 送信した通知の総数
    "deactivated": 2, // 無効化した購読数
    "executionTimeMs": 1500 // 実行時間（ミリ秒）
  }
}
```

**問題がある場合の診断：**

1. **`usersNotified: 0`**: 通知対象ユーザーが存在しない、または購読がない
2. **`notificationsSent: 0`**: 通知が送信されていない
3. **`deactivated: X` (大きな数)**: 多くの購読が無効（古い/削除された購読）

## 🔍 次に確認すべきこと

診断結果を元に、以下を確認してください：

### パターン A: `has_vapid_public: false` または `has_vapid_private: false`

**問題**: 環境変数が設定されていない

**解決方法**:

1. Vercel Dashboard → Settings → Environment Variables
2. 以下の環境変数を追加：
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
3. 再デプロイ

### パターン B: `push_subscriptions.total_active: 0`

**問題**: プッシュ通知を登録しているユーザーがいない

**解決方法**:

1. ユーザーがブラウザで通知を許可しているか確認
2. `PushRegistrar`コンポーネントが正常に動作しているか確認
3. 開発環境では通知がスキップされるので、本番環境で確認

### パターン C: `messages.sent_messages_24h: 0`

**問題**: 過去 24 時間にメッセージがない

**説明**: これは正常です。メッセージがない場合、通知は送られません。

### パターン D: すべて正常なのに通知が来ない

**考えられる原因**:

1. Vercel の Cron 機能が有効化されていない（Pro プランが必要）
2. Cron ジョブが実行されたが、タイミングの問題（既に実行済み）
3. ブラウザの通知許可がリセットされた

## 📞 診断結果を共有してください

上記の 2 つの API の結果（JSON の内容）を共有していただければ、より具体的な解決策を提案できます。
