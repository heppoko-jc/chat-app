// scripts/restore-expired-messages.js
// テスト後：期限切れメッセージを現在時刻に戻す

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function restoreExpiredMessages() {
  try {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    // 72時間以上前のメッセージを取得
    const expiredMessages = await prisma.presetMessage.findMany({
      where: {
        lastSentAt: { lt: threeDaysAgo },
        count: { gt: 0 },
      },
    });

    if (expiredMessages.length === 0) {
      console.log("✨ 期限切れのメッセージはありません。");
      return;
    }

    console.log(
      `\n📝 ${expiredMessages.length}件の期限切れメッセージを現在時刻に戻します...\n`
    );

    const now = new Date();

    for (const msg of expiredMessages) {
      await prisma.presetMessage.update({
        where: { id: msg.id },
        data: { lastSentAt: now },
      });
      console.log(`✅ "${msg.content}" → 現在時刻に更新`);
    }

    console.log("\n✨ 完了！メッセージが復活しました。\n");
  } catch (error) {
    console.error("❌ エラー:", error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreExpiredMessages();
