// scripts/daily-follow-count.js

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

async function analyzeDailyFollowCount() {
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

    console.log(`対象ユーザー数: ${allUsers.length}`);
    console.log('');

    // 期間内の全日付を生成
    const allDates = [];
    const currentDate = new Date(startUtc);
    while (currentDate <= endUtc) {
      const jstDate = utcToJst(currentDate);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      
      // その日の12:00:00（JST）をUTCに変換
      const dayNoonJst = new Date(Date.UTC(
        jstDate.getUTCFullYear(),
        jstDate.getUTCMonth(),
        jstDate.getUTCDate(),
        12, 0, 0, 0
      ));
      const dayNoonUtc = new Date(dayNoonJst.getTime() - 9 * 60 * 60 * 1000);
      
      allDates.push({
        dateKey,
        noonUtc: dayNoonUtc, // その日の12:00（JST）をUTCに変換した時刻
      });
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    console.log(`対象日数: ${allDates.length}日`);
    console.log('データを集計中...');
    console.log('');

    // 全Friendレコードを一度に取得（除外ユーザーを除く）
    console.log('Friendレコードを取得中...');
    const allFriends = await prisma.friend.findMany({
      where: {
        userId: {
          notIn: EXCLUDED_USER_IDS,
        },
        friendId: {
          notIn: EXCLUDED_USER_IDS,
        },
      },
      select: {
        userId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    console.log(`取得したFriendレコード数: ${allFriends.length}`);
    console.log('');

    // ユーザー×日付ごとのフォロー数を集計（その日の12:00時点での累積フォロー数）
    const dailyFollowCounts = new Map(); // key: "userId|date", value: count

    // 各ユーザー、各日について、その日の12:00時点でのフォロー数を計算
    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      
      // そのユーザーのFriendレコードをフィルタ
      const userFriends = allFriends.filter(f => f.userId === user.id);
      
      for (let j = 0; j < allDates.length; j++) {
        const dateInfo = allDates[j];
        const dayNoonUtc = dateInfo.noonUtc;
        
        // その日の12:00（JST）時点以前に作成されたFriendレコードの数
        const followCount = userFriends.filter(f => f.createdAt <= dayNoonUtc).length;
        
        const userDateKey = `${user.id}|${dateInfo.dateKey}`;
        dailyFollowCounts.set(userDateKey, followCount);
      }
      
      // 進捗表示
      if ((i + 1) % 10 === 0 || i === allUsers.length - 1) {
        console.log(`処理中: ${i + 1}/${allUsers.length} ユーザー`);
      }
    }

    console.log('');
    console.log('データ集計完了');
    console.log('');

    // ピボットテーブル形式のCSVデータを生成
    // ヘッダー行: ユーザーID, ユーザー名, メールアドレス, 日付1, 日付2, ..., 合計
    const header = ['ユーザーID', 'ユーザー名', 'メールアドレス', ...allDates.map(d => d.dateKey), '合計'];
    const csvLines = [header.join(',')];

    // 日付ごとの合計を計算
    const dateTotals = new Map();
    allDates.forEach(date => dateTotals.set(date.dateKey, 0));

    // ユーザーごとのデータ行を生成
    allUsers.forEach((user) => {
      const row = [user.id, `"${user.name}"`, user.email];
      let userTotal = 0;

      allDates.forEach((dateInfo) => {
        const userDateKey = `${user.id}|${dateInfo.dateKey}`;
        const count = dailyFollowCounts.get(userDateKey) || 0;
        row.push(count);
        userTotal += count;
        // 日付ごとの合計に加算
        dateTotals.set(dateInfo.dateKey, dateTotals.get(dateInfo.dateKey) + count);
      });

      // ユーザーごとの合計を追加（最後の日のフォロー数）
      const lastDateKey = allDates[allDates.length - 1].dateKey;
      const lastDateUserKey = `${user.id}|${lastDateKey}`;
      const finalCount = dailyFollowCounts.get(lastDateUserKey) || 0;
      row.push(finalCount);
      csvLines.push(row.join(','));
    });

    // 合計行を追加
    const totalRow = ['合計', '""', '""'];
    let grandTotal = 0;
    allDates.forEach((dateInfo) => {
      const dateTotal = dateTotals.get(dateInfo.dateKey);
      totalRow.push(dateTotal);
      grandTotal += dateTotal;
    });
    // 合計行の最後は、最後の日の合計
    const lastDateTotal = dateTotals.get(allDates[allDates.length - 1].dateKey);
    totalRow.push(lastDateTotal);
    csvLines.push(totalRow.join(','));

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'daily-follow-count.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー（期間を含むファイル名）
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'daily-follow-count-10-11-to-12-02.csv');
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);
    console.log(`   ユーザー数: ${allUsers.length}`);
    console.log(`   日数: ${allDates.length}`);
    console.log('');

    // サマリー統計
    const totalUsers = allUsers.length;
    const totalDays = allDates.length;
    const usersWithFollows = new Set(allFriends.map(f => f.userId)).size;

    console.log('=== サマリー ===');
    console.log(`対象ユーザー数: ${totalUsers}`);
    console.log(`フォローしているユーザー数: ${usersWithFollows}`);
    console.log(`対象期間の日数: ${totalDays}日`);
    console.log(`総フォロー数: ${allFriends.length}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDailyFollowCount();

