// scripts/user-match-dm-unique.js

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

async function analyzeUserMatchAndDM(userIds, period1Start, period1End, period2Start, period2End) {
  try {
    console.log('マッチ相手とDM相手のユニーク数を集計中...');
    console.log('');

    const results = [];

    for (const userId of userIds) {
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
        console.log(`ユーザー ${userId} が見つかりません`);
        continue;
      }

      console.log(`処理中: ${user.name} (${userId})`);

      // 期間1: JST 11/3-12/2
      const period1StartUtc = jstToUtc(period1Start.year, period1Start.month, period1Start.day, 0, 0, 0);
      const period1EndUtc = jstToUtc(period1End.year, period1End.month, period1End.day, 23, 59, 59);

      // 期間1のマッチした相手のユニーク数
      const period1Matches = await prisma.matchPair.findMany({
        where: {
          OR: [
            { user1Id: userId },
            { user2Id: userId },
          ],
          matchedAt: {
            gte: period1StartUtc,
            lte: period1EndUtc,
          },
          AND: [
            {
              user1Id: {
                notIn: EXCLUDED_USER_IDS,
              },
            },
            {
              user2Id: {
                notIn: EXCLUDED_USER_IDS,
              },
            },
          ],
        },
        select: {
          user1Id: true,
          user2Id: true,
        },
      });

      const period1MatchPartners = new Set();
      period1Matches.forEach((match) => {
        const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
        if (!EXCLUDED_USER_IDS.includes(partnerId)) {
          period1MatchPartners.add(partnerId);
        }
      });

      // 期間1のDM相手のユニーク数
      const period1Messages = await prisma.message.findMany({
        where: {
          senderId: userId,
          createdAt: {
            gte: period1StartUtc,
            lte: period1EndUtc,
          },
        },
        select: {
          chatId: true,
        },
        distinct: ['chatId'],
      });

      const period1ChatIds = period1Messages.map(msg => msg.chatId);
      const period1Chats = await prisma.chat.findMany({
        where: {
          id: {
            in: period1ChatIds,
          },
        },
        select: {
          user1Id: true,
          user2Id: true,
        },
      });

      const period1DMPartners = new Set();
      period1Chats.forEach((chat) => {
        const partnerId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
        if (!EXCLUDED_USER_IDS.includes(partnerId)) {
          period1DMPartners.add(partnerId);
        }
      });

      // 期間2: JST 12/3-12/14
      const period2StartUtc = jstToUtc(period2Start.year, period2Start.month, period2Start.day, 0, 0, 0);
      const period2EndUtc = jstToUtc(period2End.year, period2End.month, period2End.day, 23, 59, 59);

      // 期間2のマッチした相手のユニーク数
      const period2Matches = await prisma.matchPair.findMany({
        where: {
          OR: [
            { user1Id: userId },
            { user2Id: userId },
          ],
          matchedAt: {
            gte: period2StartUtc,
            lte: period2EndUtc,
          },
          AND: [
            {
              user1Id: {
                notIn: EXCLUDED_USER_IDS,
              },
            },
            {
              user2Id: {
                notIn: EXCLUDED_USER_IDS,
              },
            },
          ],
        },
        select: {
          user1Id: true,
          user2Id: true,
        },
      });

      const period2MatchPartners = new Set();
      period2Matches.forEach((match) => {
        const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
        if (!EXCLUDED_USER_IDS.includes(partnerId)) {
          period2MatchPartners.add(partnerId);
        }
      });

      // 期間2のDM相手のユニーク数
      const period2Messages = await prisma.message.findMany({
        where: {
          senderId: userId,
          createdAt: {
            gte: period2StartUtc,
            lte: period2EndUtc,
          },
        },
        select: {
          chatId: true,
        },
        distinct: ['chatId'],
      });

      const period2ChatIds = period2Messages.map(msg => msg.chatId);
      const period2Chats = await prisma.chat.findMany({
        where: {
          id: {
            in: period2ChatIds,
          },
        },
        select: {
          user1Id: true,
          user2Id: true,
        },
      });

      const period2DMPartners = new Set();
      period2Chats.forEach((chat) => {
        const partnerId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
        if (!EXCLUDED_USER_IDS.includes(partnerId)) {
          period2DMPartners.add(partnerId);
        }
      });

      results.push({
        userId,
        userName: user.name,
        period1MatchCount: period1MatchPartners.size,
        period1DMCount: period1DMPartners.size,
        period2MatchCount: period2MatchPartners.size,
        period2DMCount: period2DMPartners.size,
      });

      // 進捗表示（10人ごと）
      const index = results.length;
      if (index % 10 === 0 || index === userIds.length) {
        console.log(`  期間1 (11/3-12/2): マッチ ${period1MatchPartners.size}人, DM ${period1DMPartners.size}人`);
        console.log(`  期間2 (12/3-12/14): マッチ ${period2MatchPartners.size}人, DM ${period2DMPartners.size}人`);
        console.log(`処理中: ${index}/${userIds.length} ユーザー`);
        console.log('');
      }
    }

    // 結果を表示
    console.log('=== 結果サマリー ===');
    console.log('ユーザー名 | 期間1マッチ | 期間1DM | 期間2マッチ | 期間2DM');
    console.log('------------------------------------------------------------');
    results.forEach((result) => {
      console.log(`${result.userName} | ${result.period1MatchCount}人 | ${result.period1DMCount}人 | ${result.period2MatchCount}人 | ${result.period2DMCount}人`);
    });

    // CSVファイルに出力
    const csvLines = [
      'ユーザーID,ユーザー名,期間1マッチ相手数,期間1DM相手数,期間2マッチ相手数,期間2DM相手数',
    ];

    results.forEach((result) => {
      csvLines.push([
        result.userId,
        `"${result.userName}"`,
        result.period1MatchCount,
        result.period1DMCount,
        result.period2MatchCount,
        result.period2DMCount,
      ].join(','));
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'user-match-dm-unique.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'user-match-dm-unique.csv');
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

async function main() {
  // 全ユーザーを取得（除外ユーザーを除く）
  const allUsers = await prisma.user.findMany({
    where: {
      id: {
        notIn: EXCLUDED_USER_IDS,
      },
    },
    select: {
      id: true,
    },
  });

  const userIds = allUsers.map(user => user.id);

  console.log(`対象ユーザー数: ${userIds.length}人`);
  console.log('');

  // 期間1: JST 11/3-12/2
  const period1Start = { year: 2025, month: 11, day: 3 };
  const period1End = { year: 2025, month: 12, day: 2 };

  // 期間2: JST 12/3-12/14
  const period2Start = { year: 2025, month: 12, day: 3 };
  const period2End = { year: 2025, month: 12, day: 14 };

  await analyzeUserMatchAndDM(userIds, period1Start, period1End, period2Start, period2End);
}

main();

