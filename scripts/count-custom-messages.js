// scripts/count-custom-messages.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function countCustomMessages() {
  try {
    console.log('自作メッセージ数を集計中...');
    console.log('');

    // PresetMessageの内容を取得
    const presetMessages = await prisma.presetMessage.findMany({
      select: {
        content: true,
      },
    });
    const presetMessageContents = new Set(presetMessages.map(pm => pm.content));

    console.log(`PresetMessage総数: ${presetMessages.length}件`);
    console.log('');

    // 全SentMessageを取得（非表示も含む）
    const allSentMessages = await prisma.sentMessage.findMany({
      select: {
        message: true,
        isHidden: true,
      },
    });

    // 自作メッセージをカウント
    let totalCustomCount = 0;
    let visibleCustomCount = 0;
    let hiddenCustomCount = 0;

    // メッセージ内容ごとの統計
    const customMessageTypes = new Map(); // key: message, value: count

    allSentMessages.forEach((msg) => {
      if (!presetMessageContents.has(msg.message)) {
        totalCustomCount++;
        if (msg.isHidden) {
          hiddenCustomCount++;
        } else {
          visibleCustomCount++;
        }
        
        // メッセージ種類ごとにカウント
        customMessageTypes.set(msg.message, (customMessageTypes.get(msg.message) || 0) + 1);
      }
    });

    const totalSentMessages = allSentMessages.length;
    const presetMessageCount = totalSentMessages - totalCustomCount;

    console.log('=== 結果 ===');
    console.log(`SentMessage総数: ${totalSentMessages}件`);
    console.log(`  - PresetMessage（選択式）: ${presetMessageCount}件`);
    console.log(`  - 自作メッセージ: ${totalCustomCount}件`);
    console.log('');
    console.log(`自作メッセージ内訳:`);
    console.log(`  - 表示中: ${visibleCustomCount}件`);
    console.log(`  - 非表示: ${hiddenCustomCount}件`);
    console.log(`  - 自作メッセージの種類数: ${customMessageTypes.size}種類`);
    console.log('');
    console.log(`自作メッセージの割合: ${(totalCustomCount / totalSentMessages * 100).toFixed(2)}%`);

    // 自作メッセージの種類を表示（上位20件）
    const sortedCustomTypes = Array.from(customMessageTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    console.log('');
    console.log('=== 自作メッセージ種類（上位20件） ===');
    sortedCustomTypes.forEach(([message, count], index) => {
      const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;
      console.log(`${index + 1}. ${truncatedMessage}: ${count}件`);
    });

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

countCustomMessages();

