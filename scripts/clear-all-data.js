import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearAllData() {
  try {
    console.log("🗑️  データベースの全データを削除しています...\n");

    // 外部キー制約を考慮して、依存関係の順序で削除
    console.log("📝 Message を削除中...");
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`   ✓ ${deletedMessages.count} 件削除\n`);

    console.log("💬 Chat を削除中...");
    const deletedChats = await prisma.chat.deleteMany({});
    console.log(`   ✓ ${deletedChats.count} 件削除\n`);

    console.log("📨 SentMessage を削除中...");
    const deletedSentMessages = await prisma.sentMessage.deleteMany({});
    console.log(`   ✓ ${deletedSentMessages.count} 件削除\n`);

    console.log("🤝 MatchPair を削除中...");
    const deletedMatchPairs = await prisma.matchPair.deleteMany({});
    console.log(`   ✓ ${deletedMatchPairs.count} 件削除\n`);

    console.log("🔔 PushSubscription を削除中...");
    const deletedPushSubscriptions = await prisma.pushSubscription.deleteMany(
      {}
    );
    console.log(`   ✓ ${deletedPushSubscriptions.count} 件削除\n`);

    console.log("📋 PresetMessage を削除中...");
    const deletedPresetMessages = await prisma.presetMessage.deleteMany({});
    console.log(`   ✓ ${deletedPresetMessages.count} 件削除\n`);

    console.log("👤 User を削除中...");
    const deletedUsers = await prisma.user.deleteMany({});
    console.log(`   ✓ ${deletedUsers.count} 件削除\n`);

    console.log("✅ すべてのデータが正常に削除されました！");
    console.log("\n📊 削除されたデータの合計:");
    console.log(`   - ユーザー: ${deletedUsers.count}`);
    console.log(`   - チャット: ${deletedChats.count}`);
    console.log(`   - メッセージ: ${deletedMessages.count}`);
    console.log(`   - 送信メッセージ: ${deletedSentMessages.count}`);
    console.log(`   - マッチペア: ${deletedMatchPairs.count}`);
    console.log(`   - プッシュ通知購読: ${deletedPushSubscriptions.count}`);
    console.log(`   - プリセットメッセージ: ${deletedPresetMessages.count}`);
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearAllData().catch((error) => {
  console.error(error);
  process.exit(1);
});
