// 簡単なテストスクリプト

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function quickCheck() {
  try {
    const userCount = await prisma.user.count();
    const messageCount = await prisma.message.count();
    const matchCount = await prisma.matchPair.count();

    console.log('総ユーザー数:', userCount);
    console.log('総メッセージ数:', messageCount);
    console.log('総マッチ数:', matchCount);
  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

quickCheck();

