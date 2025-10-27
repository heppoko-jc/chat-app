# 📋 診断ページの使い方

## ✅ デプロイが完了したら、以下の URL にアクセスしてください：

### 🌐 診断ページ

```
https://あなたのドメイン/admin/diagnose
```

※Vercel デプロイは認証保護されているため、カスタムドメインを設定するか、認証設定を変更してください。

## 🎯 代替方法：Vercel ダッシュボードから確認

もし認証保護されている場合は、以下からログを確認できます：

### 1. Vercel Dashboard にアクセス

https://vercel.com/dashboard

### 2. Functions タブを開く

- 左サイドバーから **Functions** を選択
- `chat-app` プロジェクトを選択

### 3. Cron Jobs のログを確認

- **Cron Jobs** セクションから `digest-17` を選択
- **Runtime Logs** で以下のログを確認：

```
🚀 Digest notification started (17:00 JST)
📊 Processed X users with unmatched messages
📊 Processed X users with feed new messages
📱 Sent unmatched notification to user XXX: X messages
✅ Digest notification completed in Xms
```

### 4. 診断 API の結果を直接確認

以下のコマンドを実行して診断 API の結果を確認できます：

```bash
# あなたのドメインに置き換えてください
curl https://あなたのドメイン/api/admin/diagnose | jq '.'
```

## 🔍 確認すべき情報

### 環境変数チェック

- `has_vapid_public`: `true` である必要があります
- `has_vapid_private`: `true` である必要があります

### プッシュ購読の確認

- `total_active`: プッシュ通知を登録しているユーザー数（0 より大きい必要あり）
- `unique_users`: ユニークなユーザー数

### メッセージの確認

- `sent_messages_24h`: 過去 24 時間の送信メッセージ数
- `unmatched_count`: 未マッチメッセージ数
- `total_users_with_feed_new`: フィード新着があるユーザー数

## 🚀 次のステップ

診断結果を確認したら、結果を共有してください。問題の原因を特定して解決策を提案します。
