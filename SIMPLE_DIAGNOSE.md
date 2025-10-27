# 🔍 ダイジェスト通知の診断方法

## 📍 現在表示している画面について

今表示しているのは **Vercel Database（Postgres）のダッシュボード** です。
これは**データベース専用の画面**なので、Functions（API）や Cron Jobs は表示されません。

## ✅ 正しい診断方法

### 方法 1: 実際のアプリから診断ページにアクセス

1. 本番アプリにアクセスしてください：

   - URL: プロジェクトの本番 URL（例：`https://chat-app-xxx.vercel.app`）

2. 以下の URL にアクセス：

   ```
   https://プロジェクトURL/admin/diagnose
   ```

3. ページに診断結果が表示されます

### 方法 2: データベースで直接確認

現在開いているデータベースの画面を使って、以下を確認できます：

#### データベースで確認すべき項目

1. **プッシュ購読の状況**

   - 左サイドバーから「Tables」を選択
   - `pushSubscription` テーブルを開く
   - `isActive` が `true` のレコード数を確認

2. **過去 24 時間のメッセージ**

   - `sentMessage` テーブルを開く
   - `createdAt` が過去 24 時間以内のレコード数を確認

3. **PresetMessage**
   - `presetMessage` テーブルを開く
   - `lastSentAt` が過去 24 時間以内で `count > 0` のレコード数を確認

## 🚀 一番簡単な方法：デプロイ確認

ターミナルで以下を実行してください：

```bash
# 最新のデプロイを確認
vercel inspect https://プロジェクトURL --wait

# または直接ブラウザでアクセス
# https://プロジェクトURL/api/admin/diagnose
```

## 💡 ヒント

画像を見ると、「Monitoring」というセクションがあり、Compute Units と RAM の使用量が表示されています。

これは、**Functions が動作している証拠**です。

Cron Jobs のログを確認したい場合は：

1. 左上の「Projects」をクリック
2. `chat-app` を選択
3. 「Deployments」タブを選択
4. 各デプロイメントの「Logs」を確認
