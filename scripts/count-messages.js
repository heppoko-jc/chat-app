// scripts/count-messages.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function countMessages() {
  try {
    console.log('メッセージ数を集計中...');
    console.log('');

    // SentMessageの総数
    const totalSentMessages = await prisma.sentMessage.count();
    const visibleSentMessages = await prisma.sentMessage.count({
      where: {
        isHidden: false,
      },
    });
    const hiddenSentMessages = totalSentMessages - visibleSentMessages;

    // PresetMessageの総数
    const totalPresetMessages = await prisma.presetMessage.count();

    console.log('=== メッセージ数 ===');
    console.log(`SentMessage総数: ${totalSentMessages}件`);
    console.log(`  - 表示中: ${visibleSentMessages}件`);
    console.log(`  - 非表示: ${hiddenSentMessages}件`);
    console.log(`PresetMessage総数: ${totalPresetMessages}件`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

countMessages();

