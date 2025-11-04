// scripts/hide-messages-by-keywords.js
// キーワードを含む過去のメッセージを非表示にするスクリプト

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// 環境変数からキーワードを取得
function getHiddenKeywords() {
  const keywords = process.env.HIDDEN_KEYWORDS || "";
  if (!keywords) return [];

  return keywords
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

// メッセージに非表示キーワードが含まれているかチェック
function shouldHideMessage(message) {
  const keywords = getHiddenKeywords();
  if (keywords.length === 0) return false;

  const normalizedMessage = message.toLowerCase();

  return keywords.some((keyword) =>
    normalizedMessage.includes(keyword.toLowerCase())
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("🔍 キーワードを含むメッセージを検索中...");

  const keywords = getHiddenKeywords();
  if (keywords.length === 0) {
    console.error("❌ HIDDEN_KEYWORDS環境変数が設定されていません");
    process.exit(1);
  }

  console.log(`📝 設定されたキーワード: ${keywords.join(", ")}`);

  // 現在非表示でないメッセージを全て取得
  const allMessages = await prisma.sentMessage.findMany({
    where: {
      isHidden: false,
    },
    select: {
      id: true,
      message: true,
      createdAt: true,
      senderId: true,
      receiverId: true,
    },
  });

  console.log(`📊 総メッセージ数: ${allMessages.length}件`);

  // キーワードを含むメッセージをフィルタ
  const messagesToHide = allMessages.filter((msg) =>
    shouldHideMessage(msg.message)
  );

  console.log(`⚠️  非表示対象メッセージ: ${messagesToHide.length}件`);

  if (dryRun) {
    console.log("\n🔍 ドライラン: 実際には非表示にしません");
    console.log("\nサンプルメッセージ（最初の10件）:");
    messagesToHide.slice(0, 10).forEach((msg, idx) => {
      console.log(
        `${idx + 1}. [${msg.createdAt.toISOString()}] ${msg.message.substring(
          0,
          50
        )}...`
      );
    });
    return;
  }

  if (messagesToHide.length === 0) {
    console.log("✅ 非表示にするメッセージはありませんでした");
    return;
  }

  // 実際に非表示にする
  console.log("\n🚀 非表示処理を開始...");

  const messageIds = messagesToHide.map((m) => m.id);
  const batchSize = 100;
  let totalUpdated = 0;

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const result = await prisma.sentMessage.updateMany({
      where: {
        id: { in: batch },
      },
      data: {
        isHidden: true,
      },
    });
    totalUpdated += result.count;
    console.log(
      `  📦 バッチ ${Math.floor(i / batchSize) + 1}: ${
        result.count
      }件を非表示にしました`
    );
  }

  console.log(
    `\n✅ 完了: 合計 ${totalUpdated}件のメッセージを非表示にしました`
  );
}

main()
  .catch((error) => {
    console.error("❌ エラー:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
