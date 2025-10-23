// scripts/test-expired-messages.js
// テスト用：既存のメッセージのlastSentAtを期限切れに設定する

import { PrismaClient } from "@prisma/client";
import { MATCH_EXPIRY_HOURS } from "../lib/match-utils.js";
const prisma = new PrismaClient();

async function createExpiredMessages() {
  try {
    // 既存のメッセージを取得
    const messages = await prisma.presetMessage.findMany({
      where: { count: { gt: 0 } },
      orderBy: { lastSentAt: "desc" },
      take: 3, // 最初の3件を期限切れにする
    });

    if (messages.length === 0) {
      console.log(
        "❌ メッセージが見つかりません。先にメッセージを送信してください。"
      );
      return;
    }

    console.log(
      `\n📝 ${messages.length}件のメッセージを期限切れに設定します...\n`
    );

    const expiredTime = new Date(
      Date.now() - (MATCH_EXPIRY_HOURS + 1) * 60 * 60 * 1000
    );

    for (const msg of messages) {
      await prisma.presetMessage.update({
        where: { id: msg.id },
        data: { lastSentAt: expiredTime },
      });
      console.log(`✅ "${msg.content}" → 期限切れに設定`);
    }

    console.log("\n✨ 完了！メイン画面とHistory画面で確認してください。\n");
    console.log("💡 元に戻すには、誰かがそのメッセージを再送信するか、");
    console.log(
      "   scripts/restore-expired-messages.js を実行してください。\n"
    );
  } catch (error) {
    console.error("❌ エラー:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createExpiredMessages();
