# 本番環境での非表示機能セットアップ

## ⚠️ 重要: データベースの確認

**開発環境と本番環境が同じデータベースを使用している場合**、既にマイグレーションが適用されているため、以下のステップ 1 は**スキップ**してください。

### データベースの確認方法

```bash
# マイグレーションの状態を確認
npx prisma migrate status
```

もし既にマイグレーションが適用されている場合は、ステップ 2（環境変数の設定）から開始してください。

---

## 📋 必要な作業

### 1. データベースマイグレーションの適用（開発環境と本番環境が別 DB の場合のみ）

本番データベースに`isHidden`カラムを追加する必要があります。

#### 方法 A: Vercel CLI で実行（推奨）

```bash
# Vercel CLIをインストール（まだの場合）
npm i -g vercel

# Vercelにログイン
vercel login

# プロジェクトをリンク
vercel link

# 本番環境のデータベースURLを取得
# Vercel Dashboard → Project Settings → Environment Variables → DATABASE_URL

# マイグレーションを適用
DATABASE_URL="本番のDATABASE_URL" npx prisma migrate deploy
```

#### 方法 B: 手動で SQL を実行

もしデータベースに直接アクセスできる場合は、以下を実行：

```sql
-- SentMessageテーブルにisHiddenカラムを追加
ALTER TABLE "public"."SentMessage"
ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- インデックスを追加（パフォーマンス向上）
CREATE INDEX "SentMessage_isHidden_idx" ON "public"."SentMessage"("isHidden");
```

### 2. Vercel 環境変数の設定

Vercel Dashboard で以下を設定：

1. **Vercel Dashboard** → **あなたのプロジェクト** → **Settings** → **Environment Variables**

2. 以下の環境変数を追加：

   ```
   HIDDEN_KEYWORDS=死にたい,自殺
   ```

   または、必要に応じて他のキーワードを追加：

   ```
   HIDDEN_KEYWORDS=死にたい,自殺,自傷
   ```

3. **Environment**を選択：

   - Production（本番環境）
   - Preview（プレビュー環境、必要に応じて）
   - Development（開発環境、必要に応じて）

4. **Save**をクリック

### 3. コードのデプロイ

コードを Git にプッシュすると、Vercel が自動的にデプロイします：

```bash
# 変更をコミット
git add .
git commit -m "Add message hiding feature with keyword filtering"

# 本番ブランチにプッシュ（通常はmainまたはmaster）
git push origin main
```

### 4. デプロイ後の確認

デプロイが完了したら、以下を確認：

#### 4.1 マイグレーションが適用されているか確認

```bash
# 本番環境の診断APIで確認
curl https://あなたのドメイン/api/admin/diagnose
```

または、ブラウザで以下にアクセス：

```
https://あなたのドメイン/admin/diagnose
```

#### 4.2 非表示機能が動作するか確認

1. **管理画面にアクセス**：

   ```
   https://あなたのドメイン/admin/hide-by-keywords
   ```

2. **「🔍 検索（ドライラン）」をクリック**して、キーワードを含むメッセージが検出されるか確認

3. **実際に非表示にする**場合は「🚀 非表示にする」をクリック

#### 4.3 新しいメッセージが自動的に非表示になるか確認

キーワードを含むメッセージを送信して、自動的に非表示になるか確認してください。

## ⚠️ 注意事項

1. **マイグレーションの実行タイミング**：

   - マイグレーションは**コードのデプロイ前**に実行することを推奨
   - または、デプロイ時にエラーが発生する可能性があるため、事前に確認

2. **データベースのバックアップ**：

   - 本番環境のマイグレーション実行前に、必ずデータベースのバックアップを取得してください

3. **環境変数の設定**：

   - `HIDDEN_KEYWORDS`はカンマ区切りで複数のキーワードを設定可能
   - 例: `HIDDEN_KEYWORDS=死にたい,自殺,自傷`

4. **既存メッセージの非表示**：
   - 過去のメッセージを非表示にするには、管理画面（`/admin/hide-by-keywords`）から実行してください

## 🔧 トラブルシューティング

### マイグレーションエラー

エラー: `column "isHidden" already exists`

→ 既にカラムが存在している場合、マイグレーションをスキップします：

```bash
DATABASE_URL="本番のDATABASE_URL" npx prisma migrate resolve --applied 20251104082133_add_is_hidden_to_sent_message
```

### 環境変数が読み込まれない

→ Vercel Dashboard で環境変数を設定した後、**必ず再デプロイ**してください。

### Prisma クライアントエラー

→ `vercel.json`の`buildCommand`に`npx prisma generate`が含まれているので、自動的に実行されます。デプロイログを確認してください。

## 📝 チェックリスト

- [ ] 本番データベースにマイグレーションを適用
- [ ] Vercel 環境変数に`HIDDEN_KEYWORDS`を設定
- [ ] コードをデプロイ
- [ ] 管理画面で非表示機能をテスト
- [ ] 新しいメッセージが自動的に非表示になることを確認
