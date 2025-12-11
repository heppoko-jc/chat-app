// scripts/user-direct-messages.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// JST日付をUTCに変換（JST = UTC+9）
function jstToUtc(jstYear, jstMonth, jstDay, hour = 0, minute = 0, second = 0) {
  const jstDate = new Date(Date.UTC(jstYear, jstMonth - 1, jstDay, hour, minute, second));
  return new Date(jstDate.getTime() - 9 * 60 * 60 * 1000);
}

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

async function analyzeUserDirectMessages(userId, startJst, endJst) {
  try {
    console.log(`ユーザーID: ${userId}`);
    console.log(`対象期間: JST ${startJst.year}/${startJst.month}/${startJst.day} ～ ${endJst.year}/${endJst.month}/${endJst.day}`);
    console.log('ダイレクトメッセージ分析を実行中...');
    console.log('');

    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, 0, 0, 0);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, 23, 59, 59);

    // ユーザー情報を取得
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      console.error('ユーザーが見つかりません');
      return;
    }

    console.log(`ユーザー名: ${user.name}`);
    console.log('');

    // 期間内のダイレクトメッセージを取得
    const directMessages = await prisma.message.findMany({
      where: {
        senderId: userId,
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
      },
      select: {
        id: true,
        chatId: true,
        content: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const totalDirectMessages = directMessages.length;

    // 期間内の日数を計算
    const daysInPeriod = Math.floor((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const weeksInPeriod = daysInPeriod / 7;

    // 日別の送信数を集計
    const dailyCounts = new Map();
    directMessages.forEach((msg) => {
      const jstDate = utcToJst(msg.createdAt);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
    });

    // チャット別の送信数を集計
    const chatCounts = new Map();
    directMessages.forEach((msg) => {
      chatCounts.set(msg.chatId, (chatCounts.get(msg.chatId) || 0) + 1);
    });

    // チャット情報を取得（相手の情報を取得するため）
    const chatIds = Array.from(chatCounts.keys());
    const chats = await prisma.chat.findMany({
      where: {
        id: {
          in: chatIds,
        },
      },
      select: {
        id: true,
        user1Id: true,
        user2Id: true,
      },
    });

    // チャットIDから相手のユーザーIDを取得
    const chatToOtherUser = new Map();
    chats.forEach((chat) => {
      const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
      chatToOtherUser.set(chat.id, otherUserId);
    });

    // 相手ユーザー情報を取得
    const otherUserIds = Array.from(chatToOtherUser.values());
    const otherUsers = await prisma.user.findMany({
      where: {
        id: {
          in: otherUserIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const otherUserMap = new Map();
    otherUsers.forEach((u) => {
      otherUserMap.set(u.id, u.name);
    });

    // 結果を表示
    console.log('=== ダイレクトメッセージ分析結果 ===');
    console.log(`総送信数: ${totalDirectMessages}件`);
    console.log(`期間内の日数: ${daysInPeriod}日`);
    console.log(`期間内の週数: ${weeksInPeriod.toFixed(2)}週`);
    console.log(`1日あたり平均: ${(totalDirectMessages / daysInPeriod).toFixed(2)}件`);
    console.log(`週あたり平均: ${(totalDirectMessages / weeksInPeriod).toFixed(2)}件`);
    console.log(`チャット数: ${chatCounts.size}件`);
    console.log('');

    // チャット別の送信数（上位10件）
    const sortedChats = Array.from(chatCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log('=== チャット別送信数（上位10件） ===');
    sortedChats.forEach(([chatId, count], index) => {
      const otherUserId = chatToOtherUser.get(chatId);
      const otherUserName = otherUserMap.get(otherUserId) || '不明';
      console.log(`${index + 1}. ${otherUserName}: ${count}件`);
    });

    // CSVファイルに出力
    const csvLines = [
      '指標,値',
      `総送信数,${totalDirectMessages}件`,
      `期間内の日数,${daysInPeriod}日`,
      `期間内の週数,${weeksInPeriod.toFixed(2)}週`,
      `1日あたり平均,${(totalDirectMessages / daysInPeriod).toFixed(2)}件`,
      `週あたり平均,${(totalDirectMessages / weeksInPeriod).toFixed(2)}件`,
      `チャット数,${chatCounts.size}件`,
      '',
      '日別送信数',
      '日付,送信数',
    ];

    // 日別データを追加
    const sortedDates = Array.from(dailyCounts.keys()).sort();
    sortedDates.forEach((date) => {
      csvLines.push(`${date},${dailyCounts.get(date)}`);
    });

    csvLines.push('');
    csvLines.push('チャット別送信数（上位20件）');
    csvLines.push('相手ユーザー名,送信数');

    const sortedChatsForCsv = Array.from(chatCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    sortedChatsForCsv.forEach(([chatId, count]) => {
      const otherUserId = chatToOtherUser.get(chatId);
      const otherUserName = otherUserMap.get(otherUserId) || '不明';
      csvLines.push(`${otherUserName},${count}`);
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', `user-direct-messages-${userId}.csv`);
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', `user-direct-messages-${userId}.csv`);
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log('');
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数からユーザーIDを取得
const userId = process.argv[2] || 'de06a56e-5390-4fa7-b9f6-4ff4c5807e1d';

// 期間: JST 11/3 00:00 ～ 12/2 23:59:59
const startJst = { year: 2025, month: 11, day: 3 };
const endJst = { year: 2025, month: 12, day: 2 };

analyzeUserDirectMessages(userId, startJst, endJst);

