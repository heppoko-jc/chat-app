#!/bin/bash

# このスクリプトを実行すると、診断APIの結果が表示されます
# URLを実際のドメインに置き換えてください

echo "🔍 ダイジェスト通知の診断を開始します..."
echo ""
echo "⚠️  実際のドメインに置き換えてから実行してください"
echo ""

# ここに実際のURLを入力してください
# 例: https://chat-app-2.vercel.app
DOMAIN="https://your-domain.vercel.app"

echo "📍 診断エンドポイントにアクセス中..."
curl -s "${DOMAIN}/api/admin/diagnose" | jq '.'

echo ""
echo "📊 ダイジェストAPIを手動実行中..."
curl -s "${DOMAIN}/api/cron/digest-17" | jq '.'

echo ""
echo "✅ 診断完了"

