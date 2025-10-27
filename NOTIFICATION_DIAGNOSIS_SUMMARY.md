# ダイジェスト通知が来ない原因の診断結果

## 対象ユーザー

- ID: `48c8e1b2-c607-4b56-87a5-f200c4f692cd`

## 診断結果

### ✅ 満たしている条件

1. **プッシュ購読**: 15 件（アクティブ）
2. **未マッチメッセージ**: 22 件（過去 24 時間）
3. **フィード新着メッセージ**: 28 件（過去 24 時間）
4. **Friend 関係**: 36 件
5. **通知対象ユーザーリストに含まれる**: ✅
6. **購読を持っているユーザーリストに含まれる**: ✅

### 🔍 確認した事実

1. API `/api/cron/digest-17` は正常に動作している

   - 40 ユーザーに通知を送信
   - 144 件の通知を送信成功

2. 購読は全て Apple Push Notification Service (APNs)

   - エンドポイント: `https://web.push.apple.com/...`

3. 最新の購読は 10/27 15:36 に作成された

## 考えられる原因

### 1. 🍎 Apple PWA/Safari の制限

iOS PWA でブラウザが閉じている時に通知が届かない可能性があります。

- Service Worker がバックグラウンドで動作していない
- ブラウザが閉じられてしまった
- PWA が完全にアンインストールされた

### 2. ⏰ タイミングの問題

- Cron ジョブの実行時刻と通知送信のタイミングがずれている
- 過去 24 時間の判定が誤っている

### 3. 🔔 通知設定の問題

- ユーザーが通知を拒否している
- OS の設定で通知がブロックされている
- 複数の購読があり、最新の購読に通知が送られていない

### 4. 🌐 Vercel 環境とローカル環境の違い

- Vercel の環境変数とローカル環境変数が異なる
- VAPID キーが一致していない可能性

## 推奨される解決方法

### 方法 1: Service Worker の状態を確認

ブラウザのデベロッパーツールで確認:

```javascript
// コンソールで実行
navigator.serviceWorker.getRegistrations().then((regs) => {
  console.log("Service Workers:", regs.length);
  regs.forEach((reg) => console.log(reg));
});
```

### 方法 2: 通知許可状態を確認

```javascript
console.log("通知許可:", Notification.permission);
```

### 方法 3: 手動で Cron を実行して確認

```bash
curl "https://happy-ice-cream.vercel.app/api/cron/digest-17"
```

### 方法 4: 最新の購読だけに送信する

既存の購読を無効化して、最新の購読だけに送信するように変更する

## 次のステップ

1. ブラウザのデベロッパーツールで Service Worker と通知許可を確認
2. 実際にブラウザに通知が届くか手動でテスト
3. Vercel の環境変数を確認
