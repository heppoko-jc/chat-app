# マッチメッセージ削除ガイド（初心者向け）

## 📋 目次

1. [準備](#準備)
2. [方法 1: ブラウザで簡単に削除（推奨）](#方法1-ブラウザで簡単に削除推奨)
3. [方法 2: コマンドラインで削除](#方法2-コマンドラインで削除)
4. [よくある質問](#よくある質問)

---

## 準備

### 1. 環境変数の設定

まず、管理者 API キーを設定します。

#### ローカル開発環境の場合

プロジェクトのルートディレクトリに `.env.local` ファイルを作成（または編集）します：

```bash
# .env.local ファイル
NEXT_PUBLIC_ADMIN_API_KEY=your-secret-admin-key-here
```

**重要**: `your-secret-admin-key-here` の部分を、推測されにくい長い文字列に変更してください（例: `my-secret-key-2024-abc123xyz`）

#### Vercel などの本番環境の場合

Vercel のダッシュボードで環境変数を設定：

1. プロジェクトの「Settings」→「Environment Variables」
2. `NEXT_PUBLIC_ADMIN_API_KEY` を追加
3. 値を設定して保存

### 2. サーバーの再起動

環境変数を変更した場合は、開発サーバーを再起動してください：

```bash
# 開発サーバーを停止（Ctrl+C）
# そして再起動
npm run dev
```

---

## 方法 1: ブラウザで簡単に削除（推奨）

この方法が最も簡単です。ブラウザの画面から操作できます。

### 手順

1. **管理画面を開く**

   - ブラウザで以下の URL にアクセス：
     ```
     http://localhost:3000/admin/delete-match-message
     ```
   - または本番環境の場合：
     ```
     https://your-domain.com/admin/delete-match-message
     ```

2. **メッセージを検索**

   - 検索ボックスに削除したいメッセージの内容を入力（一部でも可）
   - 例: "https://example.com" や "こんにちは" など
   - 「検索」ボタンをクリック

3. **検索結果を確認**

   - 該当するメッセージが表示されます
   - メッセージ内容、ユーザー情報、マッチ時刻が表示されます
   - 削除したいメッセージを確認

4. **削除を実行**
   - 削除したいメッセージの「このメッセージを削除」ボタンをクリック
   - 確認ダイアログで「OK」を選択
   - 削除が完了すると、結果が表示されます

### 注意点

- ⚠️ **削除は取り消せません**。削除前に必ず内容を確認してください
- 検索結果から削除されたメッセージは自動的にリストから消えます

---

## 方法 2: コマンドラインで削除

ターミナル（コマンドプロンプト）を使える方向けの方法です。

### ステップ 1: メッセージを検索

まず、削除したいメッセージを検索して、`matchPairId` を取得します。

#### Windows の場合

```cmd
# PowerShell または コマンドプロンプトを開く
curl -X GET "http://localhost:3000/api/admin/search-match-messages?message=検索したいメッセージ" -H "Authorization: Bearer your-secret-admin-key-here"
```

#### Mac/Linux の場合

```bash
# ターミナルを開く
curl -X GET "http://localhost:3000/api/admin/search-match-messages?message=検索したいメッセージ" \
  -H "Authorization: Bearer your-secret-admin-key-here"
```

**注意**:

- `検索したいメッセージ` の部分を実際のメッセージ内容に置き換えてください
- `your-secret-admin-key-here` を `.env.local` で設定した API キーに置き換えてください

**レスポンス例**:

```json
{
  "count": 1,
  "matchPairs": [
    {
      "id": "abc123-def456-ghi789",
      "message": "削除したいメッセージ",
      "matchedAt": "2024-01-01T12:00:00.000Z",
      "user1": {
        "id": "user-id-1",
        "name": "ユーザー1",
        "email": "user1@example.com"
      },
      "user2": {
        "id": "user-id-2",
        "name": "ユーザー2",
        "email": "user2@example.com"
      }
    }
  ]
}
```

この `id` の値（例: `abc123-def456-ghi789`）をメモしておきます。

### ステップ 2: メッセージを削除

取得した `matchPairId` を使って削除します。

#### Windows の場合

```cmd
curl -X DELETE http://localhost:3000/api/admin/delete-match-message ^
  -H "Authorization: Bearer your-secret-admin-key-here" ^
  -H "Content-Type: application/json" ^
  -d "{\"matchPairId\": \"abc123-def456-ghi789\"}"
```

#### Mac/Linux の場合

```bash
curl -X DELETE http://localhost:3000/api/admin/delete-match-message \
  -H "Authorization: Bearer your-secret-admin-key-here" \
  -H "Content-Type: application/json" \
  -d '{"matchPairId": "abc123-def456-ghi789"}'
```

**注意**:

- `abc123-def456-ghi789` をステップ 1 で取得した実際の ID に置き換えてください
- `your-secret-admin-key-here` を実際の API キーに置き換えてください

**成功時のレスポンス**:

```json
{
  "success": true,
  "deleted": {
    "matchPairs": 1,
    "sentMessages": 2,
    "presetMessageUpdates": 1
  },
  "details": {
    "deletedMatchPairs": [...],
    "presetMessageUpdates": [...]
  }
}
```

---

## よくある質問

### Q1: 環境変数が設定されていない場合はどうなりますか？

A: デフォルトの `admin-key-123` が使用されます。ただし、本番環境では必ず独自の API キーを設定してください。

### Q2: 複数のメッセージが検索結果に出てきた場合、一度に削除できますか？

A: 現在の実装では、1 つずつ削除する必要があります。複数削除したい場合は、検索結果の各メッセージに対して「削除」ボタンをクリックしてください。

### Q3: 削除したメッセージは復元できますか？

A: いいえ、削除は取り消せません。削除前に必ず確認してください。

### Q4: 削除範囲はどのくらいですか？

A: MatchPair のマッチ時刻の前後 5 分以内に送信された SentMessage のみが削除対象です。これにより、意図しない削除を防いでいます。

### Q5: エラーが出た場合はどうすればいいですか？

A: エラーメッセージを確認してください。よくある原因：

- API キーが間違っている → `.env.local` を確認
- サーバーが起動していない → `npm run dev` で起動
- メッセージが見つからない → 検索キーワードを変更

---

## トラブルシューティング

### 問題: "Unauthorized" エラーが出る

**原因**: API キーが正しく設定されていない、または間違っている

**解決方法**:

1. `.env.local` ファイルに `NEXT_PUBLIC_ADMIN_API_KEY` が正しく設定されているか確認
2. サーバーを再起動
3. ブラウザの場合は、ページをリロード

### 問題: 検索結果が 0 件

**原因**: 検索キーワードが一致しない、またはそのメッセージが存在しない

**解決方法**:

- 検索キーワードを短くする（部分一致で検索できます）
- 別のキーワードで試す
- データベースに実際にそのメッセージが存在するか確認

### 問題: 削除が失敗する

**原因**: MatchPair が既に削除されている、またはデータベースの状態が不正

**解決方法**:

- エラーメッセージを確認
- データベースの状態を確認（`/api/admin/diagnose` など）
- サーバーのログを確認

---

## サポート

問題が解決しない場合は、以下を確認してください：

- サーバーのログ（ターミナルに表示されるエラー）
- ブラウザの開発者ツール（F12）のコンソール
- データベースの状態
