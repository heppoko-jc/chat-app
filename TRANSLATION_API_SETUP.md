# 翻訳API設定ガイド

このアプリでは、メッセージの自動翻訳機能を提供しています。Google Cloud Translation API または DeepL API を使用できます。

## 設定方法

### 1. Google Cloud Translation API を使用する場合（推奨）

#### 手順

1. **Google Cloud Console でプロジェクトを作成**
   - [Google Cloud Console](https://console.cloud.google.com/) にアクセス
   - 新しいプロジェクトを作成（または既存のプロジェクトを選択）

2. **Translation API を有効化**
   - 「APIとサービス」→「ライブラリ」に移動
   - 「Cloud Translation API」を検索して有効化

3. **APIキーを作成**
   - 「APIとサービス」→「認証情報」に移動
   - 「認証情報を作成」→「APIキー」を選択
   - 作成されたAPIキーをコピー

4. **環境変数を設定**
   
   **ローカル開発環境（.env.local）:**
   ```bash
   GOOGLE_TRANSLATE_API_KEY=your_api_key_here
   ```

   **Vercel（本番環境）:**
   - Vercel Dashboard → プロジェクト → Settings → Environment Variables
   - 以下の環境変数を追加:
     - `GOOGLE_TRANSLATE_API_KEY`: 作成したAPIキー

#### 料金
- 無料枠: 月間500,000文字まで無料
- 超過分: 100万文字あたり$20

---

### 2. DeepL API を使用する場合

#### 手順

1. **DeepLアカウントを作成**
   - [DeepL API](https://www.deepl.com/pro-api) にアクセス
   - アカウントを作成（無料プランあり）

2. **APIキーを取得**
   - ダッシュボードにログイン
   - APIキーをコピー

3. **環境変数を設定**
   
   **ローカル開発環境（.env.local）:**
   ```bash
   DEEPL_API_KEY=your_api_key_here
   TRANSLATION_PROVIDER=deepl
   ```

   **Vercel（本番環境）:**
   - Vercel Dashboard → プロジェクト → Settings → Environment Variables
   - 以下の環境変数を追加:
     - `DEEPL_API_KEY`: 作成したAPIキー
     - `TRANSLATION_PROVIDER`: `deepl`

#### 料金
- 無料プラン: 月間500,000文字まで無料
- 有料プラン: 月額€5.49〜（500万文字まで）

---

## 環境変数の優先順位

1. `TRANSLATION_PROVIDER` が `deepl` の場合 → DeepL API を使用
2. それ以外の場合 → Google Cloud Translation API を使用（デフォルト）

## 注意事項

- **APIキーが設定されていない場合**: 翻訳機能はスキップされ、元のテキスト（日本語）がそのまま表示されます
- **エラーが発生した場合**: 翻訳に失敗してもアプリは正常に動作し、元のテキストが表示されます
- **翻訳キャッシュ**: 同じテキストの翻訳はデータベースにキャッシュされ、API呼び出しを削減します

## トラブルシューティング

### APIキーが認識されない場合

1. 環境変数が正しく設定されているか確認
2. `.env.local` ファイルが `.gitignore` に含まれているか確認
3. Vercelの環境変数が正しく設定されているか確認
4. アプリを再起動（環境変数の変更は再起動が必要な場合があります）

### 翻訳が動作しない場合

1. ブラウザのコンソールでエラーログを確認
2. サーバーログでAPIエラーを確認
3. APIキーの有効期限を確認
4. APIの使用制限（無料枠の超過など）を確認

