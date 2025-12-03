// scripts/user-growth-analysis.js

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// JST日付をUTCに変換（JST = UTC+9）
function jstToUtc(jstYear, jstMonth, jstDay, hour = 0, minute = 0, second = 0) {
  // JSTの日時を作成
  const jstDate = new Date(Date.UTC(jstYear, jstMonth - 1, jstDay, hour, minute, second));
  // JSTからUTCに変換（9時間戻す）
  return new Date(jstDate.getTime() - 9 * 60 * 60 * 1000);
}

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
  return jstDate;
}

async function analyzeUserGrowth() {
  try {
    // 対象期間: JST 10/11 00:00 から 12/2 23:59:59
    // UTCに変換: 10/10 15:00 から 12/2 14:59:59
    const startJst = { year: 2025, month: 10, day: 11, hour: 0, minute: 0, second: 0 };
    const endJst = { year: 2025, month: 12, day: 2, hour: 23, minute: 59, second: 59 };
    
    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, startJst.hour, startJst.minute, startJst.second);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, endJst.hour, endJst.minute, endJst.second);

    console.log('対象期間:');
    console.log(`  JST: ${startJst.year}/${startJst.month}/${startJst.day} 00:00:00 ～ ${endJst.year}/${endJst.month}/${endJst.day} 23:59:59`);
    console.log(`  UTC: ${startUtc.toISOString()} ～ ${endUtc.toISOString()}`);
    console.log('');

    // 期間内に登録された全ユーザーを取得（createdAtでソート）
    const users = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(`期間内の新規登録ユーザー数: ${users.length}`);
    console.log('');

    // 日次でグループ化
    const dailyGrowth = new Map();

    // 期間内の各日を初期化
    const currentDate = new Date(startUtc);
    while (currentDate <= endUtc) {
      const jstDate = utcToJst(currentDate);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      dailyGrowth.set(dateKey, { date: dateKey, newUsers: 0, cumulativeUsers: 0 });
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    // 期間前の累積ユーザー数を取得
    const usersBeforePeriod = await prisma.user.count({
      where: {
        createdAt: {
          lt: startUtc,
        },
      },
    });

    console.log(`期間開始前の既存ユーザー数: ${usersBeforePeriod}`);
    console.log('');

    // 各ユーザーを日付ごとに分類
    users.forEach((user) => {
      const jstDate = utcToJst(user.createdAt);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      
      if (dailyGrowth.has(dateKey)) {
        dailyGrowth.get(dateKey).newUsers += 1;
      }
    });

    // 累積ユーザー数を計算
    let cumulative = usersBeforePeriod;
    const sortedDates = Array.from(dailyGrowth.keys()).sort();
    
    sortedDates.forEach((dateKey) => {
      const day = dailyGrowth.get(dateKey);
      cumulative += day.newUsers;
      day.cumulativeUsers = cumulative;
    });

    // 結果を表示
    console.log('=== 日次ユーザー数推移 ===');
    console.log('日付(JST) | 新規登録 | 累積ユーザー数');
    console.log('----------------------------------------');
    
    sortedDates.forEach((dateKey) => {
      const day = dailyGrowth.get(dateKey);
      console.log(`${day.date} | ${String(day.newUsers).padStart(6)} | ${String(day.cumulativeUsers).padStart(10)}`);
    });

    console.log('');
    console.log('=== サマリー ===');
    console.log(`期間開始時点のユーザー数: ${usersBeforePeriod}`);
    console.log(`期間中の新規登録数: ${users.length}`);
    console.log(`期間終了時点のユーザー数: ${usersBeforePeriod + users.length}`);
    console.log(`1日あたりの平均新規登録数: ${(users.length / sortedDates.length).toFixed(2)}`);

    // CSVファイルに出力
    const csvLines = ['日付(JST),新規登録数,累積ユーザー数'];
    sortedDates.forEach((dateKey) => {
      const day = dailyGrowth.get(dateKey);
      csvLines.push(`${day.date},${day.newUsers},${day.cumulativeUsers}`);
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'user-growth-data.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    console.log('');
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeUserGrowth();

