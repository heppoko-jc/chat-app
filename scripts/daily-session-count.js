// scripts/daily-session-count.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// 除外するユーザーID（ダミーユーザー）
const EXCLUDED_USER_IDS = [
  'a3cb6700-2998-42ad-adc2-63cb847cc426',
  '6450a621-02bc-4282-a79f-4e2cbc6cd352',
  '100bbaea-98b5-427d-9903-86b9350932db',
  'd06b5736-b45f-49f9-8022-7d9a7f07fff7',
  '3e6c9b53-e16f-4cb0-b917-a6f5f4da8d1d',
  'dee5119c-057a-4004-bea8-bf2c8944b7d7',
  '17da8fcc-6289-494d-b0e6-cf9edc3a82f5',
  '58a08854-03be-466e-9594-c07a2fc18cf4',
  '37a83251-2515-4d60-88d9-6582bf8e7f17',
  'b0b57a0c-334d-40cf-9eb5-77064281f380',
  '8b1f95a9-858b-4e1c-ae64-2f939c3830e4',
  'e50c0557-dc92-4cc5-832a-07508ff65f68',
];

// JST日付をUTCに変換（JST = UTC+9）
function jstToUtc(jstYear, jstMonth, jstDay, hour = 0, minute = 0, second = 0) {
  const jstDate = new Date(Date.UTC(jstYear, jstMonth - 1, jstDay, hour, minute, second));
  return new Date(jstDate.getTime() - 9 * 60 * 60 * 1000);
}

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

async function analyzeDailySessionCount() {
  try {
    // 対象期間: JST 10/11 00:00 から 12/2 23:59:59
    const startJst = { year: 2025, month: 10, day: 11, hour: 0, minute: 0, second: 0 };
    const endJst = { year: 2025, month: 12, day: 2, hour: 23, minute: 59, second: 59 };
    
    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, startJst.hour, startJst.minute, startJst.second);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, endJst.hour, endJst.minute, endJst.second);

    console.log('対象期間:');
    console.log(`  JST: ${startJst.year}/${startJst.month}/${startJst.day} 00:00:00 ～ ${endJst.year}/${endJst.month}/${endJst.day} 23:59:59`);
    console.log(`  UTC: ${startUtc.toISOString()} ～ ${endUtc.toISOString()}`);
    console.log('');

    // 期間内の全UserSessionを取得（除外ユーザーを除く）
    const userSessions = await prisma.userSession.findMany({
      where: {
        startTime: {
          gte: startUtc,
          lte: endUtc,
        },
        userId: {
          notIn: EXCLUDED_USER_IDS,
        },
      },
      select: {
        userId: true,
        startTime: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    console.log(`期間内のセッション総数: ${userSessions.length}`);
    console.log('');

    // 全ユーザーを取得（除外ユーザーを除く）
    const allUsers = await prisma.user.findMany({
      where: {
        id: {
          notIn: EXCLUDED_USER_IDS,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 日付ごとのセッション回数を集計（ユーザー×日付）
    const dailyCounts = new Map(); // key: "userId|date", value: count

    userSessions.forEach((session) => {
      const jstDate = utcToJst(session.startTime);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      const userDateKey = `${session.userId}|${dateKey}`;
      
      dailyCounts.set(userDateKey, (dailyCounts.get(userDateKey) || 0) + 1);
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
        const userDateKey = `${user.id}|${dateKey}`;
        const count = dailyCounts.get(userDateKey) || 0;
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
    const csvPath = join(process.cwd(), 'scripts', 'daily-session-count.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー（期間を含むファイル名）
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'daily-session-count-10-11-to-12-02.csv');
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);
    console.log(`   ユーザー数: ${allUsers.length}`);
    console.log(`   日数: ${allDates.length}`);
    console.log('');

    // サマリー統計
    const totalUsers = allUsers.length;
    const totalDays = allDates.length;
    const totalSessions = userSessions.length;
    const usersWithSessions = new Set(userSessions.map(s => s.userId)).size;

    console.log('=== サマリー ===');
    console.log(`対象ユーザー数: ${totalUsers}`);
    console.log(`セッションしたユーザー数: ${usersWithSessions}`);
    console.log(`対象期間の日数: ${totalDays}日`);
    console.log(`総セッション数: ${totalSessions}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDailySessionCount();

