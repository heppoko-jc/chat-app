// scripts/period-comparison.js

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

// JST日付をUTCに変換
function jstToUtc(jstDate) {
  return new Date(jstDate.getTime() - 9 * 60 * 60 * 1000);
}

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

// 日付をJST文字列に変換（YYYY-MM-DD）
function formatJstDate(date) {
  const jst = utcToJst(date);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function comparePeriods() {
  try {
    console.log('期間比較データを集計中...');
    console.log('');

    // 期間1: JST 11/3-12/2
    const period1StartJst = new Date(Date.UTC(2025, 10, 3, 0, 0, 0, 0));
    const period1EndJst = new Date(Date.UTC(2025, 11, 2, 23, 59, 59, 999));
    const period1StartUtc = jstToUtc(period1StartJst);
    const period1EndUtc = jstToUtc(period1EndJst);

    // 期間2: JST 12/2-12/19
    const period2StartJst = new Date(Date.UTC(2025, 11, 2, 0, 0, 0, 0));
    const period2EndJst = new Date(Date.UTC(2025, 11, 19, 23, 59, 59, 999));
    const period2StartUtc = jstToUtc(period2StartJst);
    const period2EndUtc = jstToUtc(period2EndJst);

    console.log('期間1: JST 11/3-12/2');
    console.log('期間2: JST 12/2-12/19');
    console.log('');

    // 各期間のデータを取得
    const [period1Data, period2Data] = await Promise.all([
      getPeriodData(period1StartUtc, period1EndUtc, '期間1'),
      getPeriodData(period2StartUtc, period2EndUtc, '期間2'),
    ]);

    // 結果を表示
    console.log('=== 期間比較サマリー ===');
    console.log('');
    console.log('【期間1: JST 11/3-12/2】');
    console.log(`  PresetMessage数: ${period1Data.presetMessageCount}件`);
    console.log(`  SentMessage数: ${period1Data.sentMessageCount}件`);
    console.log(`  UserSession数: ${period1Data.userSessionCount}件`);
    console.log(`  アクティブユーザー数: ${period1Data.activeUserCount}人`);
    console.log(`  1日あたり平均送信数: ${period1Data.avgSentPerDay.toFixed(2)}件/日`);
    console.log(`  1人あたり平均送信数: ${period1Data.avgSentPerUser.toFixed(2)}件/人`);
    console.log(`  1人あたり平均セッション数: ${period1Data.avgSessionPerUser.toFixed(2)}回/人`);
    console.log('');
    console.log('【期間2: JST 12/2-12/19】');
    console.log(`  PresetMessage数: ${period2Data.presetMessageCount}件`);
    console.log(`  SentMessage数: ${period2Data.sentMessageCount}件`);
    console.log(`  UserSession数: ${period2Data.userSessionCount}件`);
    console.log(`  アクティブユーザー数: ${period2Data.activeUserCount}人`);
    console.log(`  1日あたり平均送信数: ${period2Data.avgSentPerDay.toFixed(2)}件/日`);
    console.log(`  1人あたり平均送信数: ${period2Data.avgSentPerUser.toFixed(2)}件/人`);
    console.log(`  1人あたり平均セッション数: ${period2Data.avgSessionPerUser.toFixed(2)}回/人`);
    console.log('');

    // CSVファイルに出力
    const csvLines = [
      '期間比較データ',
      '',
      '【期間1: JST 11/3-12/2】',
      '指標,値',
      `PresetMessage数,${period1Data.presetMessageCount}件`,
      `SentMessage数,${period1Data.sentMessageCount}件`,
      `UserSession数,${period1Data.userSessionCount}件`,
      `アクティブユーザー数,${period1Data.activeUserCount}人`,
      `1日あたり平均送信数,${period1Data.avgSentPerDay.toFixed(2)}件/日`,
      `1人あたり平均送信数,${period1Data.avgSentPerUser.toFixed(2)}件/人`,
      `1人あたり平均セッション数,${period1Data.avgSessionPerUser.toFixed(2)}回/人`,
      '',
      '【期間2: JST 12/2-12/19】',
      '指標,値',
      `PresetMessage数,${period2Data.presetMessageCount}件`,
      `SentMessage数,${period2Data.sentMessageCount}件`,
      `UserSession数,${period2Data.userSessionCount}件`,
      `アクティブユーザー数,${period2Data.activeUserCount}人`,
      `1日あたり平均送信数,${period2Data.avgSentPerDay.toFixed(2)}件/日`,
      `1人あたり平均送信数,${period2Data.avgSentPerUser.toFixed(2)}件/人`,
      `1人あたり平均セッション数,${period2Data.avgSessionPerUser.toFixed(2)}回/人`,
      '',
      '【日別送信数 - 期間1】',
      '日付,送信数',
    ];

    // 期間1の日別データ
    period1Data.dailySent.forEach((day) => {
      csvLines.push(`${day.date},${day.count}`);
    });

    csvLines.push('');
    csvLines.push('【日別送信数 - 期間2】');
    csvLines.push('日付,送信数');

    // 期間2の日別データ
    period2Data.dailySent.forEach((day) => {
      csvLines.push(`${day.date},${day.count}`);
    });

    csvLines.push('');
    csvLines.push('【日別セッション数 - 期間1】');
    csvLines.push('日付,セッション数');

    // 期間1の日別セッション数
    period1Data.dailySessions.forEach((day) => {
      csvLines.push(`${day.date},${day.count}`);
    });

    csvLines.push('');
    csvLines.push('【日別セッション数 - 期間2】');
    csvLines.push('日付,セッション数');

    // 期間2の日別セッション数
    period2Data.dailySessions.forEach((day) => {
      csvLines.push(`${day.date},${day.count}`);
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'period-comparison.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'period-comparison.csv');
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

async function getPeriodData(startUtc, endUtc, periodName) {
  console.log(`${periodName}のデータを取得中...`);

  // PresetMessage数（期間内に作成されたもの）
  const presetMessageCount = await prisma.presetMessage.count({
    where: {
      createdAt: {
        gte: startUtc,
        lte: endUtc,
      },
    },
  });

  // SentMessage数（期間内の送信、除外ユーザーを除く）
  const sentMessages = await prisma.sentMessage.findMany({
    where: {
      createdAt: {
        gte: startUtc,
        lte: endUtc,
      },
      isHidden: false,
      senderId: {
        notIn: EXCLUDED_USER_IDS,
      },
    },
    select: {
      createdAt: true,
      senderId: true,
    },
  });

  const sentMessageCount = sentMessages.length;

  // UserSession数（期間内のセッション、除外ユーザーを除く）
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
      startTime: true,
      userId: true,
    },
  });

  const userSessionCount = userSessions.length;

  // アクティブユーザー数（SentMessageを送ったユーザー）
  const activeUserIds = new Set(sentMessages.map((msg) => msg.senderId));
  const activeUserCount = activeUserIds.size;

  // 日別送信数を集計
  const dailySentMap = new Map();
  sentMessages.forEach((msg) => {
    const dateKey = formatJstDate(msg.createdAt);
    dailySentMap.set(dateKey, (dailySentMap.get(dateKey) || 0) + 1);
  });

  const dailySent = Array.from(dailySentMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 日別セッション数を集計
  const dailySessionsMap = new Map();
  userSessions.forEach((session) => {
    const dateKey = formatJstDate(session.startTime);
    dailySessionsMap.set(dateKey, (dailySessionsMap.get(dateKey) || 0) + 1);
  });

  const dailySessions = Array.from(dailySessionsMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // 期間の日数を計算
  const daysInPeriod = Math.ceil((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // 平均を計算
  const avgSentPerDay = sentMessageCount / daysInPeriod;
  const avgSentPerUser = activeUserCount > 0 ? sentMessageCount / activeUserCount : 0;
  const avgSessionPerUser = activeUserCount > 0 ? userSessionCount / activeUserCount : 0;

  return {
    presetMessageCount,
    sentMessageCount,
    userSessionCount,
    activeUserCount,
    avgSentPerDay,
    avgSentPerUser,
    avgSessionPerUser,
    dailySent,
    dailySessions,
  };
}

comparePeriods();



