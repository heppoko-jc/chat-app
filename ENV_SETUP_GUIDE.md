# 環境変数の設定方法（初心者向け）

## 📝 はじめに

`.env.local` ファイルは、アプリケーションの設定を保存するファイルです。このファイルに管理者 API キーを設定します。

**重要**: `.env.local` ファイルは Git にコミットされません（安全のため）

---

## 🎯 方法 1: VS Code を使う（最も簡単）

### 手順

1. **VS Code でプロジェクトを開く**

   - プロジェクトフォルダを開いていることを確認

2. **新しいファイルを作成**

   - 左側のファイル一覧で、プロジェクトのルート（一番上の階層）を右クリック
   - 「新しいファイル」を選択
   - ファイル名を `.env.local` と入力（先頭のドットも含む）

3. **内容を入力**

   - ファイルを開いたら、以下の内容をコピー＆ペースト：

   ```
   NEXT_PUBLIC_ADMIN_API_KEY=my-secret-admin-key-2024
   ```

   - `my-secret-admin-key-2024` の部分を、自分だけが知っている文字列に変更してください
   - 例: `my-super-secret-key-abc123xyz`

4. **保存**
   - `Ctrl + S` (Windows) または `Cmd + S` (Mac) で保存

---

## 🎯 方法 2: テキストエディタを使う

### Windows の場合

1. **メモ帳を開く**

   - Windows キーを押して「メモ帳」と検索

2. **内容を入力**

   ```
   NEXT_PUBLIC_ADMIN_API_KEY=my-secret-admin-key-2024
   ```

   - `my-secret-admin-key-2024` の部分を変更してください

3. **保存**
   - 「ファイル」→「名前を付けて保存」
   - 保存先をプロジェクトのルートフォルダに設定
   - ファイル名を `.env.local` と入力（引用符で囲む: `".env.local"`）
   - 「ファイルの種類」を「すべてのファイル」に変更
   - 保存

### Mac の場合

1. **テキストエディットを開く**

   - アプリケーションから「テキストエディット」を開く

2. **内容を入力**

   ```
   NEXT_PUBLIC_ADMIN_API_KEY=my-secret-admin-key-2024
   ```

   - `my-secret-admin-key-2024` の部分を変更してください

3. **保存**
   - 「ファイル」→「名前を付けて保存」
   - 保存先をプロジェクトのルートフォルダに設定
   - ファイル名を `.env.local` と入力

---

## 🎯 方法 3: ターミナル/コマンドプロンプトを使う

### Windows の場合（PowerShell）

1. **PowerShell を開く**

   - Windows キーを押して「PowerShell」と検索

2. **プロジェクトフォルダに移動**

   ```powershell
   cd C:\Users\takumikiyama\Documents\GitHub\chat-app-2
   ```

   （実際のパスに合わせて変更してください）

3. **ファイルを作成**
   ```powershell
   echo NEXT_PUBLIC_ADMIN_API_KEY=my-secret-admin-key-2024 > .env.local
   ```
   - `my-secret-admin-key-2024` の部分を変更してください

### Mac の場合（ターミナル）

1. **ターミナルを開く**

   - アプリケーション → ユーティリティ → ターミナル

2. **プロジェクトフォルダに移動**

   ```bash
   cd ~/Documents/GitHub/chat-app-2
   ```

3. **ファイルを作成**
   ```bash
   echo "NEXT_PUBLIC_ADMIN_API_KEY=my-secret-admin-key-2024" > .env.local
   ```
   - `my-secret-admin-key-2024` の部分を変更してください

---

## ✅ 確認方法

### VS Code で確認

1. 左側のファイル一覧で `.env.local` が表示されているか確認
2. ファイルを開いて内容を確認

### ターミナルで確認

```bash
# Windows (PowerShell)
cat .env.local

# Mac/Linux
cat .env.local
```

### 正しい内容の例

```
NEXT_PUBLIC_ADMIN_API_KEY=my-super-secret-key-abc123xyz
```

**注意**:

- `=` の前後にスペースは不要です
- 値（`=` の後）に引用符は不要です（含めても動作しますが）

---

## 🔄 サーバーの再起動

環境変数を変更した後は、必ず開発サーバーを再起動してください：

1. **現在のサーバーを停止**

   - ターミナルで `Ctrl + C` (Windows) または `Ctrl + C` (Mac)

2. **サーバーを再起動**
   ```bash
   npm run dev
   ```

---

## ⚠️ よくある間違い

### ❌ 間違い 1: ファイル名を間違える

- `.env.local` （先頭にドット）
- `.env` や `.env.local.txt` は間違い

### ❌ 間違い 2: スペースを入れる

```
NEXT_PUBLIC_ADMIN_API_KEY = my-key  ❌ 間違い（スペースが入っている）
NEXT_PUBLIC_ADMIN_API_KEY=my-key   ✅ 正しい
```

### ❌ 間違い 3: サーバーを再起動しない

- 環境変数を変更したら必ずサーバーを再起動

---

## 📝 API キーの例

安全な API キーの例：

```
NEXT_PUBLIC_ADMIN_API_KEY=chat-app-admin-2024-secret-xyz123
NEXT_PUBLIC_ADMIN_API_KEY=my-secret-key-abc123def456
NEXT_PUBLIC_ADMIN_API_KEY=admin-key-super-secret-2024
```

**推奨**:

- 長い文字列（20 文字以上）
- ランダムな文字列（推測されにくくするため）
- 数字、アルファベット、ハイフンなどを組み合わせる

---

## 🆘 トラブルシューティング

### 問題: ファイルが見つからない

**解決方法**:

- プロジェクトのルート（`package.json` がある場所）に作成してください
- VS Code でプロジェクトを開いている場合、一番上の階層に作成してください

### 問題: ファイル名にドットがつかない

**解決方法**:

- VS Code: ファイル名を `.env.local` と入力（ドットも含む）
- Windows のメモ帳: 保存時にファイル名を `".env.local"` と引用符で囲む
- ターミナル: 上記のコマンドを使用

### 問題: 環境変数が反映されない

**解決方法**:

1. ファイル名が `.env.local` であることを確認
2. 内容が正しいことを確認（スペースがないかなど）
3. **サーバーを再起動**（最も重要！）

---

## 📚 参考

- Next.js の環境変数について: https://nextjs.org/docs/basic-features/environment-variables
- `.env.local` は Git にコミットされません（`.gitignore` に含まれています）
