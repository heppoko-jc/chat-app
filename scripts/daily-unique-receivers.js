// scripts/daily-unique-receivers.js

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

async function analyzeDailyUniqueReceivers() {
  try {
    // 対象期間: JST 10/13 00:00 から 12/7 23:59:59
    const startJst = { year: 2025, month: 10, day: 13, hour: 0, minute: 0, second: 0 };
    const endJst = { year: 2025, month: 12, day: 7, hour: 23, minute: 59, second: 59 };
    
    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, startJst.hour, startJst.minute, startJst.second);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, endJst.hour, endJst.minute, endJst.second);

    console.log('対象期間:');
    console.log(`  JST: ${startJst.year}/${startJst.month}/${startJst.day} 00:00:00 ～ ${endJst.year}/${endJst.month}/${endJst.day} 23:59:59`);
    console.log(`  UTC: ${startUtc.toISOString()} ～ ${endUtc.toISOString()}`);
    console.log('');

    // 期間内の全SentMessageを取得（isHidden=falseのみ）
    const sentMessages = await prisma.sentMessage.findMany({
      where: {
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
        isHidden: false,
      },
      select: {
        senderId: true,
        receiverId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(`期間内のメッセージ総数: ${sentMessages.length}`);
    console.log('');

    // 全ユーザーを取得（メッセージを送っていないユーザーも含める）
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 期間内の全日付を生成
    const allDates = [];
    const currentDate = new Date(startUtc);
    while (currentDate <= endUtc) {
      const jstDate = utcToJst(currentDate);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      allDates.push(dateKey);
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    // ユーザー×日付ごとの送信先ユニーク数を集計
    // key: "userId-date", value: Set of receiverIds
    const dailyUniqueReceivers = new Map();

    sentMessages.forEach((msg) => {
      const jstDate = utcToJst(msg.createdAt);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      const userDateKey = `${msg.senderId}-${dateKey}`;
      
      if (!dailyUniqueReceivers.has(userDateKey)) {
        dailyUniqueReceivers.set(userDateKey, new Set());
      }
      dailyUniqueReceivers.get(userDateKey).add(msg.receiverId);
    });

    // ピボットテーブル形式のCSVデータを生成
    // ヘッダー行: ユーザーID, ユーザー名, メールアドレス, 日付1, 日付2, ..., 合計
    const header = ['ユーザーID', 'ユーザー名', 'メールアドレス', ...allDates, '合計'];
    const csvLines = [header.join(',')];

    // 日付ごとの合計を計算
    const dateTotals = new Map();
    allDates.forEach(date => dateTotals.set(date, 0));

    // ユーザーごとのデータ行を生成
    allUsers.forEach((user) => {
      const row = [user.id, `"${user.name}"`, user.email];
      let userTotal = 0;

      allDates.forEach((dateKey) => {
        const userDateKey = `${user.id}-${dateKey}`;
        const uniqueReceivers = dailyUniqueReceivers.get(userDateKey);
        const count = uniqueReceivers ? uniqueReceivers.size : 0;
        row.push(count);
        userTotal += count;
        // 日付ごとの合計に加算
        dateTotals.set(dateKey, dateTotals.get(dateKey) + count);
      });

      // ユーザーごとの合計を追加
      row.push(userTotal);
      csvLines.push(row.join(','));
    });

    // 合計行を追加
    const totalRow = ['合計', '""', '""'];
    let grandTotal = 0;
    allDates.forEach((dateKey) => {
      const dateTotal = dateTotals.get(dateKey);
      totalRow.push(dateTotal);
      grandTotal += dateTotal;
    });
    totalRow.push(grandTotal);
    csvLines.push(totalRow.join(','));

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'daily-unique-receivers.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー（期間を含むファイル名）
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'daily-unique-receivers-10-13-to-12-07.csv');
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);
    console.log(`   ユーザー数: ${allUsers.length}`);
    console.log(`   日数: ${allDates.length}`);
    console.log('');

    // サマリー統計
    const totalUsers = allUsers.length;
    const totalDays = allDates.length;
    const totalMessages = sentMessages.length;
    const usersWithMessages = new Set(sentMessages.map(m => m.senderId)).size;

    console.log('=== サマリー ===');
    console.log(`対象ユーザー数: ${totalUsers}`);
    console.log(`メッセージ送信したユーザー数: ${usersWithMessages}`);
    console.log(`対象期間の日数: ${totalDays}日`);
    console.log(`総メッセージ送信数: ${totalMessages}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDailyUniqueReceivers();

