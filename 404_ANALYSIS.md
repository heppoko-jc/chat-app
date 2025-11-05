# /main 404 エラー分析レポート

## 問題の概要

`http://131.113.137.182:3000/main` が断続的に 404 エラーになる

## 考えられる原因

### 1. **Service Worker のプリキャッシュ問題（最も可能性が高い）**

- `next-pwa`が本番環境で有効になっている
- Service Worker が古いビルドマニフェストをキャッシュしている可能性
- `/main`ページがプリキャッシュマニフェストに含まれていない可能性

**確認方法:**

```bash
# ビルド後のマニフェストを確認
cat .next/static/chunks/workbox-*.js | grep -i "main"
# または
ls -la public/sw*.js
```

### 2. **Next.js のビルド問題**

- `app/main/page.tsx`は`"use client"`なのでクライアントコンポーネント
- ビルド時に正しくバンドルされていない可能性
- `.next`フォルダのビルド結果が不完全

**確認方法:**

```bash
# ビルドログを確認
npm run build

# ビルド後のページが存在するか確認
ls -la .next/server/app/main/
```

### 3. **サーバー側のルーティング問題**

- Next.js サーバーが正しく起動していない
- ポート 3000 が別のプロセスに占有されている
- サーバーの再起動が必要

### 4. **クライアント側のルーティング問題**

- ブラウザのキャッシュが古い
- Service Worker が古いバージョンで動作している

## 実装した対策

### ✅ Service Worker のルーティング戦略を改善（実装済み）

`service-worker.js`に以下の変更を実施しました：

```javascript
// ページルートのフォールバック戦略
// プリキャッシュに含まれていないページ（/mainなど）へのアクセス時、
// ネットワークファースト戦略を使用（ネットワーク優先、失敗時のみキャッシュ）
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({
    cacheName: "pages-cache",
    plugins: [
      {
        cacheKeyWillBeUsed: async ({ request }) => {
          return request.url;
        },
      },
    ],
  })
);
```

**効果:**

- プリキャッシュに含まれていないページ（`/main`など）でも、ネットワークから取得を試みる
- 404 エラーを防ぎ、常に最新のページを取得する
- オフライン時はキャッシュから提供

## 推奨される追加対策

### 即座に試すべき対策

1. **Service Worker のバージョンを更新**

   - `app/register-sw.tsx`の`NEXT_PUBLIC_SW_VERSION`を更新
   - または環境変数で新しいバージョン番号を設定
   - これにより、新しい Service Worker が強制的に登録される

2. **ビルドの再実行**

   ```bash
   npm run build
   npm start
   ```

3. **ブラウザのキャッシュクリア**
   - Service Worker をアンインストール（Application > Service Workers > Unregister）
   - ブラウザのキャッシュをクリア
   - ハードリロード（Ctrl+Shift+R / Cmd+Shift+R）

### 根本的な対策

1. **Service Worker のフォールバック戦略を追加**
   `service-worker.js`に以下を追加：

   ```javascript
   // ネットワークファースト戦略を追加（ページルート用）
   workbox.routing.registerRoute(
     ({ request }) => request.mode === "navigate",
     new workbox.strategies.NetworkFirst({
       cacheName: "pages-cache",
       plugins: [
         {
           cacheKeyWillBeUsed: async ({ request }) => {
             return request.url;
           },
         },
       ],
     })
   );
   ```

2. **Next.js のルーティング確認**

   - `app/main/page.tsx`が正しく存在することを確認
   - ファイル名やディレクトリ構造に問題がないか確認

3. **サーバーログの確認**

   - Next.js サーバーのログで 404 エラーが発生しているか確認
   - リクエストがサーバーに到達しているか確認

4. **環境変数の確認**
   - `NODE_ENV=production`が正しく設定されているか
   - `NEXT_PUBLIC_SW_VERSION`が設定されているか

## デバッグ手順

1. **ブラウザの開発者ツールで確認**

   - Network タブで`/main`へのリクエストが 404 を返しているか確認
   - Application タブで Service Worker の状態を確認
   - Service Worker のスコープと登録状態を確認

2. **サーバーログを確認**

   - Next.js サーバーのログでリクエストが記録されているか確認
   - 404 エラーの詳細なログを確認

3. **ビルド結果を確認**

   ```bash
   # ビルドが成功しているか確認
   npm run build

   # ビルド後のファイル構造を確認
   find .next -name "*main*" -type f
   ```

## 予防策

1. **Service Worker のバージョン管理を強化**

   - デプロイごとにバージョンを自動更新
   - ビルド時刻や Git コミットハッシュを使用

2. **エラーハンドリングの改善**

   - 404 エラー時に Service Worker を更新する仕組みを追加
   - フォールバックページを用意

3. **監視とログ**
   - 404 エラーを監視してアラートを設定
   - エラー発生時のログを詳細に記録
