# 開発環境でログインできない場合のキャッシュ削除方法

開発環境でログインできなくなった場合、以下のキャッシュを削除してください。

## 🚀 最も簡単な方法（推奨）

### 方法 1: ブラウザの開発者ツールを使用（最も簡単）

1. **ブラウザでアプリを開く**（例: `http://localhost:3000`）

2. **開発者ツールを開く**

   - Chrome/Edge: `F12` または `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Firefox: `F12` または `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - Safari: `Cmd+Option+I` (Mac) - 開発者メニューを有効化する必要があります

3. **Application タブ（Chrome/Edge）または Storage タブ（Firefox）を開く**

4. **以下の項目をクリア**

   - **Local Storage**: `http://localhost:3000` を右クリック → 「Clear」または「すべて削除」
   - **Session Storage**: `http://localhost:3000` を右クリック → 「Clear」または「すべて削除」
   - **Cache Storage**: すべてのキャッシュを右クリック → 「Delete」または「削除」
   - **Service Workers**: 登録されている Service Worker を右クリック → 「Unregister」または「登録解除」

5. **ページを再読み込み** (`F5` または `Cmd+R` / `Ctrl+R`)

---

## 🔧 方法 2: ブラウザの設定からキャッシュを削除

### Chrome/Edge の場合

1. **設定を開く**

   - アドレスバーに `chrome://settings/clearBrowserData` を入力
   - または メニュー → 「設定」→ 「プライバシーとセキュリティ」→ 「閲覧履歴データの削除」

2. **削除するデータを選択**

   - ✅ 「キャッシュされた画像とファイル」
   - ✅ 「Cookie とその他のサイトデータ」
   - ✅ 「ホストされているアプリのデータ」（Service Worker を含む）

3. **期間を選択**: 「全期間」

4. **「データを削除」をクリック**

5. **ページを再読み込み**

### Firefox の場合

1. **設定を開く**

   - メニュー → 「設定」→ 「プライバシーとセキュリティ」

2. **Cookie とサイトデータを削除**

   - 「Cookie とサイトデータを削除」をクリック
   - ✅ 「キャッシュされた Web コンテンツ」を選択
   - ✅ 「Cookie とサイトデータ」を選択
   - 「今すぐ削除」をクリック

3. **ページを再読み込み**

### Safari の場合

1. **開発メニューを有効化**（初回のみ）

   - メニュー → 「環境設定」→ 「詳細」→ 「メニューバーに"開発"メニューを表示」

2. **キャッシュをクリア**

   - メニュー → 「開発」→ 「キャッシュを空にする」

3. **ページを再読み込み**

---

## 💻 方法 3: ターミナル/コマンドラインから削除

### Next.js のビルドキャッシュを削除

```bash
# プロジェクトのルートディレクトリに移動
cd /Users/takumikiyama/Documents/GitHub/chat-app-2

# .nextフォルダを削除（Next.jsのビルドキャッシュ）
rm -rf .next

# 開発サーバーを再起動
npm run dev
```

### Node.js のキャッシュを削除（オプション）

```bash
# npmのキャッシュをクリア
npm cache clean --force

# 開発サーバーを再起動
npm run dev
```

---

## 🛠️ 方法 4: プログラムから削除（開発用）

ログインページ（`/login`）にアクセスすると、自動的に Service Worker とキャッシュが削除されます（`app/login/page.tsx` の 36-72 行目を参照）。

**注意**: この方法では LocalStorage は削除されません。LocalStorage を削除するには、ブラウザの開発者ツールを使用してください。

---

## 📋 削除すべきキャッシュの一覧

### 1. LocalStorage

以下のキーが保存されている可能性があります：

- `token` - 認証トークン
- `userId` - ユーザー ID
- `pendingLoginEmail` - 登録時のメールアドレス
- `pwaInstallAcknowledged` - PWA インストール確認
- `experimentConsent` - 実験同意情報
- `draft-message-*` - 下書きメッセージ
- `chat-last-read-*` - チャットの最終読了時刻
- `opened-match-chats-*` - 開いたマッチチャット
- `lastFriendsPageVisit-*` - フレンドページの最終訪問時刻
- `hideFollowInfoPopup-*` - ポップアップ非表示フラグ
- その他、ユーザー ID に関連するキー

### 2. SessionStorage

- `pendingLoginEmail` - 登録時のメールアドレス（一時）

### 3. Cache Storage (Service Worker)

- `fg-state-v1` - 状態キャッシュ
- `badge-store-v1` - バッジキャッシュ
- `workbox-precache-*` - Workbox のプリキャッシュ
- その他、Service Worker が使用するキャッシュ

### 4. Service Workers

- 登録されているすべての Service Worker

### 5. Next.js のビルドキャッシュ

- `.next` フォルダ

---

## 🔍 トラブルシューティング

### 問題 1: ログインページにアクセスしてもログインできない

**解決方法**:

1. ブラウザの開発者ツールで LocalStorage を確認
2. `token` と `userId` が存在する場合は削除
3. ページを再読み込み
4. 再度ログインを試みる

### 問題 2: Service Worker が削除されない

**解決方法**:

1. ブラウザの開発者ツールを開く
2. Application タブ（Chrome/Edge）または Storage タブ（Firefox）を開く
3. Service Workers セクションで、登録されている Service Worker を確認
4. 各 Service Worker を右クリック → 「Unregister」
5. ページを再読み込み

### 問題 3: キャッシュが残っている

**解決方法**:

1. ブラウザを完全に閉じる（すべてのウィンドウとタブ）
2. ブラウザを再起動
3. 開発者ツールでキャッシュを再度確認
4. 必要に応じて、ブラウザの設定からキャッシュを削除

### 問題 4: `Cannot find module './vendor-chunks/next.js'` エラー

**症状**:

- ターミナルに `Error: Cannot find module './vendor-chunks/next.js'` が表示される
- API エンドポイント（例: `/api/chat/[chatId]`）が 500 エラーを返す
- 404 エラーが多数発生する（例: `GET /_next/static/chunks/main-app.js 404`）

**原因**: Next.js のビルドキャッシュ（`.next`フォルダ）が破損している

**解決方法**:

```bash
# 1. 開発サーバーを停止（ターミナルで Ctrl+C）

# 2. .nextフォルダを削除
rm -rf .next

# 3. 開発サーバーを再起動
npm run dev
```

**それでも解決しない場合**:

```bash
# 1. 開発サーバーを停止（Ctrl+C）

# 2. .nextフォルダを削除
rm -rf .next

# 3. node_modulesも削除して再インストール（時間がかかります）
rm -rf node_modules
npm install

# 4. 開発サーバーを再起動
npm run dev
```

### 問題 5: Next.js のビルドキャッシュが問題の原因（一般的な場合）

**解決方法**:

```bash
# .nextフォルダを削除
rm -rf .next

# 開発サーバーを再起動
npm run dev
```

---

## ✅ キャッシュ削除後の確認事項

1. **LocalStorage が空であることを確認**

   - 開発者ツール → Application → Local Storage → `http://localhost:3000` が空であることを確認

2. **Service Worker が登録されていないことを確認**

   - 開発者ツール → Application → Service Workers → 登録されている Service Worker がないことを確認

3. **Cache Storage が空であることを確認**

   - 開発者ツール → Application → Cache Storage → キャッシュがないことを確認

4. **ログインページにアクセス**

   - `http://localhost:3000/login` にアクセス
   - ログインフォームが表示されることを確認

5. **ログインを試みる**
   - メールアドレス（またはユーザー名）とパスワードを入力
   - ログインボタンをクリック
   - ログインが成功することを確認

---

## 🎯 まとめ

### `Cannot find module './vendor-chunks/next.js'` エラーが発生している場合

1. **開発サーバーを停止**（ターミナルで `Ctrl+C`）
2. **`.next`フォルダを削除**: `rm -rf .next`
3. **開発サーバーを再起動**: `npm run dev`
4. **ブラウザを再読み込み**

### ログインできない場合

1. **ブラウザの開発者ツールで LocalStorage と Service Worker を削除**（最も簡単）
2. **ページを再読み込み**
3. **再度ログインを試みる**
4. **まだ解決しない場合は、Next.js のビルドキャッシュ（`.next`フォルダ）を削除**
5. **開発サーバーを再起動**

最も確実な方法は、**方法 1（ブラウザの開発者ツールを使用）** です。

---

## 📝 補足: よくある原因

1. **期限切れのトークン**: LocalStorage に古いトークンが残っている
2. **Service Worker のキャッシュ**: 古い Service Worker がキャッシュを提供している
3. **Next.js のビルドキャッシュ**: 古いビルドキャッシュが残っている
4. **ブラウザの HTTP キャッシュ**: ブラウザが古いレスポンスをキャッシュしている

これらの問題は、上記の方法で解決できます。
