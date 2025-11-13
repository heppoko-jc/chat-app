# 🔍 Vercel で通知送信機能を確認する方法

## 📋 概要

デプロイ後、Vercel で通知送信機能が正常に動作しているかを確認する手順です。

---

## 🚀 方法 1: ブラウザから直接確認（推奨）

### 1. 通知送信ページにアクセス

```
https://あなたのドメイン/admin/send-notification
```

### 2. 通知を送信

1. **タイトル**と**本文**を入力
2. **「📤 プッシュ通知を送信」**ボタンをクリック
3. 結果を確認：
   - ✅ **成功**: 緑色のメッセージが表示され、統計情報が表示されます
   - ❌ **エラー**: 赤色のメッセージが表示され、エラー詳細が表示されます

### 3. エラーが表示された場合

エラーメッセージを確認してください：

- **「Unauthorized: Invalid API key」**: API キーが正しく設定されていません
- **「VAPID keys are not configured」**: VAPID キーが設定されていません
- **「Failed to send broadcast」**: その他のエラー（詳細はエラーメッセージを確認）

---

## 🔍 方法 2: 診断 API で確認

### 1. 診断ページにアクセス

```
https://あなたのドメイン/admin/diagnose
```

または、直接 API にアクセス：

```
https://あなたのドメイン/api/admin/diagnose
```

### 2. 確認すべき項目

#### ✅ 環境変数の確認

```json
{
  "environment": {
    "has_vapid_public": true, // trueである必要があります
    "has_vapid_private": true, // trueである必要があります
    "has_next_pub_vapid": true // trueである必要があります
  }
}
```

#### ✅ プッシュ購読の確認

```json
{
  "push_subscriptions": {
    "total_active": 10, // 0より大きい必要があります
    "unique_users": 8 // ユニークなユーザー数
  }
}
```

#### ❌ 問題がある場合

- **`has_vapid_public: false`** または **`has_vapid_private: false`**

  - → 環境変数が設定されていません（後述の「環境変数の確認」を参照）

- **`total_active: 0`**
  - → プッシュ通知を登録しているユーザーがいません
  - → これは正常な場合もあります（ユーザーが通知を許可していない場合）

---

## 🖥️ 方法 3: Vercel Dashboard で確認

### 1. Vercel Dashboard にアクセス

https://vercel.com/dashboard

### 2. プロジェクトを選択

左サイドバーからプロジェクト（例：`chat-app`）を選択

### 3. 環境変数の確認

1. **Settings** → **Environment Variables** を開く
2. 以下の環境変数が設定されているか確認：

   - ✅ `VAPID_PUBLIC_KEY`
   - ✅ `VAPID_PRIVATE_KEY`
   - ✅ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - ✅ `NEXT_PUBLIC_ADMIN_API_KEY`

3. **Environment**が正しく設定されているか確認：
   - **Production** にチェックが入っているか
   - **Preview** にチェックが入っているか（必要に応じて）

### 4. Functions ログの確認

1. **Functions** タブを開く
2. **`/api/admin/broadcast`** を選択（または検索）
3. **Runtime Logs** を確認：

   - ✅ **成功**: 以下のようなログが表示されます
     ```
     Broadcast sent to 10 users
     ```
   - ❌ **エラー**: 以下のようなエラーログが表示されます
     ```
     🚨 Broadcast push error: [エラー内容]
     ❌ Invalid API key provided
     ❌ VAPID keys are not configured
     ```

### 5. デプロイログの確認

1. **Deployments** タブを開く
2. 最新のデプロイメント（一番上）を選択
3. **Build Logs** タブを確認：

   - ビルドが正常に完了しているか（`✓ Build completed`）
   - エラーが発生していないか（`✗ Build failed`）

4. **Runtime Logs** タブを確認：
   - API 呼び出し時のログ
   - エラーログ
   - リアルタイムでログが更新される

### 6. ログのリアルタイム監視

1. **Functions** → **`/api/admin/broadcast`** を開く
2. **Runtime Logs** タブを開く
3. 別のブラウザで通知送信ページを開く
4. 通知を送信する
5. **Runtime Logs** にリアルタイムでログが表示される

---

## 🧪 方法 4: curl コマンドで確認

### 1. 診断 API の確認

```bash
# あなたのドメインに置き換えてください
curl https://あなたのドメイン/api/admin/diagnose | jq '.'
```

### 2. 通知送信 API のテスト

```bash
# あなたのドメインとAPIキーに置き換えてください
curl -X POST https://あなたのドメイン/api/admin/broadcast \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer あなたのAPIキー" \
  -d '{
    "title": "テスト通知",
    "body": "これはテスト通知です",
    "url": "/",
    "type": "update"
  }' | jq '.'
```

### 3. レスポンスの確認

#### ✅ 成功した場合

```json
{
  "success": true,
  "message": "Broadcast sent to 10 users",
  "stats": {
    "total": 10,
    "success": 10,
    "failed": 0,
    "deactivated": 0
  }
}
```

#### ❌ エラーが発生した場合

```json
{
  "error": "エラーメッセージ",
  "details": "エラーの詳細"
}
```

---

## 🔧 トラブルシューティング

### 問題 1: 「Unauthorized: Invalid API key」エラー

#### 原因

- API キーが正しく設定されていない
- フロントエンドとサーバーで異なる API キーが使用されている

#### 解決方法

1. **Vercel Dashboard** → **Settings** → **Environment Variables** を開く
2. `NEXT_PUBLIC_ADMIN_API_KEY` が設定されているか確認
3. **Environment**が **Production** に設定されているか確認
4. 環境変数を変更した場合、**再デプロイ**が必要です

### 問題 2: 「VAPID keys are not configured」エラー

#### 原因

- VAPID キーが設定されていない
- 環境変数名が間違っている

#### 解決方法

1. **Vercel Dashboard** → **Settings** → **Environment Variables** を開く
2. 以下の環境変数が設定されているか確認：
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
3. 環境変数を変更した場合、**再デプロイ**が必要です

### 問題 3: 「No active subscriptions found」

#### 原因

- プッシュ通知を登録しているユーザーがいない
- すべての購読が無効化されている

#### 解決方法

1. **診断 API**で `total_active` を確認
2. ユーザーがブラウザで通知を許可しているか確認
3. `PushRegistrar` コンポーネントが正常に動作しているか確認

### 問題 4: 通知が送信されない

#### 原因

- VAPID キーが正しく設定されていない
- プッシュ購読が無効化されている
- ネットワークエラー

#### 解決方法

1. **Vercel Dashboard**の **Functions** ログを確認
2. エラーログを確認して原因を特定
3. **診断 API**で環境変数と購読数を確認

---

## ✅ 確認チェックリスト

デプロイ後、以下を確認してください：

- [ ] 環境変数が正しく設定されている
  - [ ] `VAPID_PUBLIC_KEY`
  - [ ] `VAPID_PRIVATE_KEY`
  - [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - [ ] `NEXT_PUBLIC_ADMIN_API_KEY`
- [ ] 診断 API で環境変数が正しく読み込まれている
- [ ] プッシュ購読が存在する（`total_active > 0`）
- [ ] 通知送信ページから通知を送信できる
- [ ] Vercel Dashboard のログにエラーが表示されない
- [ ] 実際に通知が届く（テスト送信）

---

## 📝 メモ

### 環境変数を変更した場合

環境変数を変更した場合、**必ず再デプロイ**が必要です：

1. **Vercel Dashboard** → **Deployments** を開く
2. 最新のデプロイメントを選択
3. **Redeploy** をクリック
4. または、コードを少し変更して Git にプッシュ（自動デプロイ）

### ログの確認方法

- **リアルタイムログ**: Vercel Dashboard → **Functions** → **Runtime Logs**
- **デプロイログ**: Vercel Dashboard → **Deployments** → **Build Logs**
- **ブラウザコンソール**: 開発者ツール（F12）→ **Console** タブ

### 本番環境でのテスト

本番環境でテストする場合：

1. テスト用の通知を送信
2. 実際に通知が届くか確認
3. エラーが発生した場合、ログを確認して原因を特定

---

## 📸 実際の確認手順（ステップバイステップ）

### ステップ 1: 環境変数の確認

1. Vercel Dashboard にログイン
2. プロジェクトを選択
3. **Settings** → **Environment Variables** を開く
4. 以下の環境変数が存在するか確認：
   - `VAPID_PUBLIC_KEY` → 値が表示されている（🔒 で隠れている）
   - `VAPID_PRIVATE_KEY` → 値が表示されている（🔒 で隠れている）
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → 値が表示されている
   - `NEXT_PUBLIC_ADMIN_API_KEY` → 値が表示されている

### ステップ 2: 診断 API で確認

1. ブラウザで以下にアクセス：
   ```
   https://あなたのドメイン/api/admin/diagnose
   ```
2. JSON が表示される
3. 以下の項目を確認：
   - `environment.has_vapid_public`: `true` であること
   - `environment.has_vapid_private`: `true` であること
   - `push_subscriptions.total_active`: `0` より大きいこと（ユーザーが通知を許可している場合）

### ステップ 3: 通知送信ページでテスト

1. ブラウザで以下にアクセス：
   ```
   https://あなたのドメイン/admin/send-notification
   ```
2. **タイトル**を入力（例：`テスト通知`）
3. **本文**を入力（例：`これはテスト通知です`）
4. **「📤 プッシュ通知を送信」**ボタンをクリック
5. 結果を確認：
   - ✅ **成功**: 緑色のメッセージが表示され、統計情報が表示される
   - ❌ **エラー**: 赤色のメッセージが表示され、エラー詳細が表示される

### ステップ 4: Vercel Dashboard でログを確認

1. Vercel Dashboard → **Functions** を開く
2. **`/api/admin/broadcast`** を選択
3. **Runtime Logs** タブを開く
4. ログを確認：
   - ✅ **成功**: `Broadcast sent to X users` のログが表示される
   - ❌ **エラー**: エラーログが表示される

### ステップ 5: 実際に通知が届くか確認

1. アプリを開く（別のデバイスまたはブラウザ）
2. 通知を許可する
3. 通知送信ページから通知を送信
4. 通知が届くか確認

---

## 🚀 次のステップ

1. 上記の確認方法で問題がないか確認
2. 問題が発生した場合、エラーメッセージを確認
3. 必要に応じて、Vercel Dashboard のログを確認
4. 解決できない場合、エラーメッセージとログを共有してください

---

## 💡 よくある質問

### Q: 環境変数を変更した後、どうすればいいですか？

A: 環境変数を変更した後、**必ず再デプロイ**が必要です：

1. Vercel Dashboard → **Deployments** を開く
2. 最新のデプロイメントを選択
3. **Redeploy** をクリック
4. または、コードを少し変更して Git にプッシュ（自動デプロイ）

### Q: ログが表示されない場合は？

A: 以下を確認してください：

1. 最新のデプロイメントが完了しているか
2. 実際に API が呼び出されているか（通知送信ページで送信してみる）
3. **Runtime Logs** タブが選択されているか

### Q: 通知が届かない場合は？

A: 以下を確認してください：

1. プッシュ購読が存在するか（`total_active > 0`）
2. VAPID キーが正しく設定されているか
3. ブラウザで通知が許可されているか
4. Vercel Dashboard のログにエラーが表示されていないか
