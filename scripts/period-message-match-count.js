// scripts/period-message-match-count.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";

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

async function countPeriodMessagesAndMatches() {
  try {
    // 期間: JST 11/3 00:00 ～ 12/2 23:59:59
    const startJst = { year: 2025, month: 11, day: 3, hour: 0, minute: 0, second: 0 };
    const endJst = { year: 2025, month: 12, day: 2, hour: 23, minute: 59, second: 59 };
    
    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, startJst.hour, startJst.minute, startJst.second);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, endJst.hour, endJst.minute, endJst.second);

    console.log('期間: JST 11/3 00:00 ～ 12/2 23:59:59');
    console.log(`UTC: ${startUtc.toISOString()} ～ ${endUtc.toISOString()}`);
    console.log('');

    // 総SentMessage数（期間内、除外ユーザーを除く、isHidden=falseのみ）
    const totalSentMessages = await prisma.sentMessage.count({
      where: {
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
        senderId: {
          notIn: EXCLUDED_USER_IDS,
        },
        isHidden: false,
      },
    });

    // 総マッチ数（期間内、除外ユーザーを除く）
    const totalMatches = await prisma.matchPair.count({
      where: {
        matchedAt: {
          gte: startUtc,
          lte: endUtc,
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
    });

    console.log('=== 結果 ===');
    console.log(`総SentMessage数: ${totalSentMessages}件`);
    console.log(`総マッチ数: ${totalMatches}件`);
    console.log('');

    if (totalSentMessages > 0) {
      const matchRate = (totalMatches / totalSentMessages * 100).toFixed(2);
      console.log(`マッチ率: ${matchRate}%`);
    }

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

countPeriodMessagesAndMatches();

