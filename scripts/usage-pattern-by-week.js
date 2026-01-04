// scripts/usage-pattern-by-week.js

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

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

// 登録日からの経過週数を計算
function getWeekSinceRegistration(registrationDate, targetDate) {
  const diffTime = targetDate.getTime() - registrationDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1; // 登録日を含む週をWeek 1とする
}

async function analyzeUsagePatternByWeek() {
  try {
    console.log('登録後経過週数ごとの利用パターンを分析中...');
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
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(`対象ユーザー数: ${allUsers.length}人`);
    console.log('');

    // 各ユーザーの週ごとのデータを集計
    const userWeekData = new Map(); // key: userId, value: { week1: {...}, week2: {...}, ... }

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      const userRegistrationDate = user.createdAt;
      
      // ユーザーの週ごとのデータを初期化
      const weekStats = {
        week1: { sentMessageTypes: 0, sentMessageCount: 0, matchCount: 0, hasData: false },
        week2: { sentMessageTypes: 0, sentMessageCount: 0, matchCount: 0, hasData: false },
        week3_4: { sentMessageTypes: 0, sentMessageCount: 0, matchCount: 0, hasData: false },
        week5plus: { sentMessageTypes: 0, sentMessageCount: 0, matchCount: 0, hasData: false },
      };

      // 期間内の全SentMessageを取得
      const sentMessages = await prisma.sentMessage.findMany({
        where: {
          senderId: user.id,
          isHidden: false,
        },
        select: {
          message: true,
          createdAt: true,
        },
      });

      // 各メッセージについて、登録後何週目かを判定
      sentMessages.forEach((msg) => {
        const weekNum = getWeekSinceRegistration(userRegistrationDate, msg.createdAt);
        
        if (weekNum === 1) {
          weekStats.week1.sentMessageCount++;
          weekStats.week1.hasData = true;
        } else if (weekNum === 2) {
          weekStats.week2.sentMessageCount++;
          weekStats.week2.hasData = true;
        } else if (weekNum >= 3 && weekNum <= 4) {
          weekStats.week3_4.sentMessageCount++;
          weekStats.week3_4.hasData = true;
        } else if (weekNum >= 5) {
          weekStats.week5plus.sentMessageCount++;
          weekStats.week5plus.hasData = true;
        }
      });

      // メッセージ種類数を集計
      const messageTypesByWeek = {
        week1: new Set(),
        week2: new Set(),
        week3_4: new Set(),
        week5plus: new Set(),
      };

      sentMessages.forEach((msg) => {
        const weekNum = getWeekSinceRegistration(userRegistrationDate, msg.createdAt);
        
        if (weekNum === 1) {
          messageTypesByWeek.week1.add(msg.message);
        } else if (weekNum === 2) {
          messageTypesByWeek.week2.add(msg.message);
        } else if (weekNum >= 3 && weekNum <= 4) {
          messageTypesByWeek.week3_4.add(msg.message);
        } else if (weekNum >= 5) {
          messageTypesByWeek.week5plus.add(msg.message);
        }
      });

      weekStats.week1.sentMessageTypes = messageTypesByWeek.week1.size;
      weekStats.week2.sentMessageTypes = messageTypesByWeek.week2.size;
      weekStats.week3_4.sentMessageTypes = messageTypesByWeek.week3_4.size;
      weekStats.week5plus.sentMessageTypes = messageTypesByWeek.week5plus.size;

      // 期間内の全マッチを取得
      const matches = await prisma.matchPair.findMany({
        where: {
          OR: [
            { user1Id: user.id },
            { user2Id: user.id },
          ],
        },
        select: {
          matchedAt: true,
        },
      });

      // 各マッチについて、登録後何週目かを判定
      matches.forEach((match) => {
        const weekNum = getWeekSinceRegistration(userRegistrationDate, match.matchedAt);
        
        if (weekNum === 1) {
          weekStats.week1.matchCount++;
        } else if (weekNum === 2) {
          weekStats.week2.matchCount++;
        } else if (weekNum >= 3 && weekNum <= 4) {
          weekStats.week3_4.matchCount++;
        } else if (weekNum >= 5) {
          weekStats.week5plus.matchCount++;
        }
      });

      userWeekData.set(user.id, weekStats);

      // 進捗表示
      if ((i + 1) % 20 === 0 || i === allUsers.length - 1) {
        console.log(`処理中: ${i + 1}/${allUsers.length} ユーザー`);
      }
    }

    console.log('');
    console.log('統計を集計中...');

    // 各週カテゴリの平均を計算
    const weekCategories = {
      week1: { name: 'Week 1 (登録直後)', users: [], totalSentTypes: 0, totalSentCount: 0, totalMatches: 0 },
      week2: { name: 'Week 2', users: [], totalSentTypes: 0, totalSentCount: 0, totalMatches: 0 },
      week3_4: { name: 'Week 3-4', users: [], totalSentTypes: 0, totalSentCount: 0, totalMatches: 0 },
      week5plus: { name: 'Week 5+', users: [], totalSentTypes: 0, totalSentCount: 0, totalMatches: 0 },
    };

    userWeekData.forEach((stats, userId) => {
      // Week 1
      if (stats.week1.hasData) {
        weekCategories.week1.users.push(userId);
        weekCategories.week1.totalSentTypes += stats.week1.sentMessageTypes;
        weekCategories.week1.totalSentCount += stats.week1.sentMessageCount;
        weekCategories.week1.totalMatches += stats.week1.matchCount;
      }

      // Week 2
      if (stats.week2.hasData) {
        weekCategories.week2.users.push(userId);
        weekCategories.week2.totalSentTypes += stats.week2.sentMessageTypes;
        weekCategories.week2.totalSentCount += stats.week2.sentMessageCount;
        weekCategories.week2.totalMatches += stats.week2.matchCount;
      }

      // Week 3-4
      if (stats.week3_4.hasData) {
        weekCategories.week3_4.users.push(userId);
        weekCategories.week3_4.totalSentTypes += stats.week3_4.sentMessageTypes;
        weekCategories.week3_4.totalSentCount += stats.week3_4.sentMessageCount;
        weekCategories.week3_4.totalMatches += stats.week3_4.matchCount;
      }

      // Week 5+
      if (stats.week5plus.hasData) {
        weekCategories.week5plus.users.push(userId);
        weekCategories.week5plus.totalSentTypes += stats.week5plus.sentMessageTypes;
        weekCategories.week5plus.totalSentCount += stats.week5plus.sentMessageCount;
        weekCategories.week5plus.totalMatches += stats.week5plus.matchCount;
      }
    });

    // 平均を計算
    const results = [];
    Object.keys(weekCategories).forEach((key) => {
      const category = weekCategories[key];
      const userCount = category.users.length;
      
      const avgSentTypesPerWeek = userCount > 0 ? (category.totalSentTypes / userCount).toFixed(2) : '0.00';
      const avgSentCountPerWeek = userCount > 0 ? (category.totalSentCount / userCount).toFixed(2) : '0.00';
      const matchRate = category.totalSentCount > 0 
        ? (category.totalMatches / category.totalSentCount * 100).toFixed(2)
        : '0.00';

      results.push({
        period: category.name,
        userCount,
        avgSentTypesPerWeek: parseFloat(avgSentTypesPerWeek),
        avgSentCountPerWeek: parseFloat(avgSentCountPerWeek),
        matchRate: parseFloat(matchRate),
      });
    });

    // 結果を表示
    console.log('');
    console.log('=== 表6.10 経過週数ごとの送信頻度 ===');
    console.log('期間 | 平均送信数/週 | マッチ率');
    console.log('----------------------------------------');
    results.forEach((result) => {
      console.log(`${result.period} | ${result.avgSentCountPerWeek}回/週 | ${result.matchRate}%`);
      console.log(`  (対象ユーザー数: ${result.userCount}人, 平均メッセージ種類数/週: ${result.avgSentTypesPerWeek}種類)`);
    });

    // CSVファイルに出力
    const csvLines = [
      '表6.10 経過週数ごとの送信頻度',
      '期間,平均送信数/週,マッチ率,対象ユーザー数,平均メッセージ種類数/週',
    ];

    results.forEach((result) => {
      csvLines.push([
        result.period,
        `${result.avgSentCountPerWeek}回/週`,
        `${result.matchRate}%`,
        `${result.userCount}人`,
        `${result.avgSentTypesPerWeek}種類`,
      ].join(','));
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'usage-pattern-by-week.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'usage-pattern-by-week.csv');
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

analyzeUsagePatternByWeek();

