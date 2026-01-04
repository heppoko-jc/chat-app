// scripts/direct-message-stats.js

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

async function analyzeDirectMessageStats() {
  try {
    // 期間: JST 11/3 00:00 ～ 12/2 23:59:59
    const startJst = { year: 2025, month: 11, day: 3, hour: 0, minute: 0, second: 0 };
    const endJst = { year: 2025, month: 12, day: 2, hour: 23, minute: 59, second: 59 };
    
    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, startJst.hour, startJst.minute, startJst.second);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, endJst.hour, endJst.minute, endJst.second);

    console.log('期間: JST 11/3 00:00 ～ 12/2 23:59:59');
    console.log('ダイレクトメッセージ統計を集計中...');
    console.log('');

    // 1. 総ダイレクトメッセージ数（期間内）
    const totalDirectMessages = await prisma.message.count({
      where: {
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
        sender: {
          id: {
            notIn: EXCLUDED_USER_IDS,
          },
        },
      },
    });

    // 2. 1人あたり平均送信数と中央値
    const userMessageCounts = await prisma.message.groupBy({
      by: ['senderId'],
      where: {
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
        sender: {
          id: {
            notIn: EXCLUDED_USER_IDS,
          },
        },
      },
      _count: {
        id: true,
      },
    });

    const messageCounts = userMessageCounts.map(u => u._count.id).sort((a, b) => a - b);
    const totalUsers = messageCounts.length;
    const avgMessagesPerUser = totalUsers > 0
      ? (messageCounts.reduce((sum, count) => sum + count, 0) / totalUsers).toFixed(2)
      : '0.00';
    
    // 中央値の計算
    let medianMessages = 0;
    if (messageCounts.length > 0) {
      const mid = Math.floor(messageCounts.length / 2);
      if (messageCounts.length % 2 === 0) {
        medianMessages = (messageCounts[mid - 1] + messageCounts[mid]) / 2;
      } else {
        medianMessages = messageCounts[mid];
      }
    }

    // 3. マッチ後に会話が発生した割合
    // 期間内のマッチを取得
    const matches = await prisma.matchPair.findMany({
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
      select: {
        user1Id: true,
        user2Id: true,
        matchedAt: true,
      },
    });

    // マッチペアを正規化
    const matchPairs = new Set();
    matches.forEach((match) => {
      const pairKey = match.user1Id < match.user2Id
        ? `${match.user1Id}|${match.user2Id}`
        : `${match.user2Id}|${match.user1Id}`;
      matchPairs.add(pairKey);
    });

    const totalMatchPairs = matchPairs.size;

    // 各マッチペアについて、マッチ後にダイレクトメッセージが送られたかを確認
    let pairsWithConversation = 0;
    let totalMessageExchanges = 0;

    for (const pairKey of matchPairs) {
      const [user1Id, user2Id] = pairKey.split('|');
      
      // このペアのマッチ時刻を取得（最初のマッチ）
      const pairMatches = matches.filter(m => {
        const key = m.user1Id < m.user2Id
          ? `${m.user1Id}|${m.user2Id}`
          : `${m.user2Id}|${m.user1Id}`;
        return key === pairKey;
      });
      
      if (pairMatches.length === 0) continue;
      
      const firstMatchTime = pairMatches.reduce((earliest, m) => 
        m.matchedAt < earliest ? m.matchedAt : earliest, pairMatches[0].matchedAt
      );

      // マッチ後に送られたダイレクトメッセージを取得
      const chat = await prisma.chat.findFirst({
        where: {
          OR: [
            { user1Id: user1Id, user2Id: user2Id },
            { user1Id: user2Id, user2Id: user1Id },
          ],
        },
        select: {
          id: true,
        },
      });

      if (chat) {
        const messagesAfterMatch = await prisma.message.findMany({
          where: {
            chatId: chat.id,
            createdAt: {
              gte: firstMatchTime,
              lte: endUtc,
            },
          },
        });

        if (messagesAfterMatch.length > 0) {
          pairsWithConversation++;
          totalMessageExchanges += messagesAfterMatch.length;
        }
      }
    }

    const conversationRate = totalMatchPairs > 0
      ? (pairsWithConversation / totalMatchPairs * 100).toFixed(2)
      : '0.00';
    
    const avgMessageExchanges = pairsWithConversation > 0
      ? (totalMessageExchanges / pairsWithConversation).toFixed(2)
      : '0.00';

    // 結果を表示
    console.log('=== ダイレクトメッセージ統計 ===');
    console.log(`総ダイレクトメッセージ数: ${totalDirectMessages}件`);
    console.log(`1人あたり平均送信数: ${avgMessagesPerUser}件（中央値：${medianMessages.toFixed(2)}件）`);
    console.log(`マッチ後に会話が発生した割合: ${conversationRate}%`);
    console.log(`マッチ後の平均メッセージ交換回数: ${avgMessageExchanges}回/ペア`);
    console.log('');
    console.log('詳細:');
    console.log(`  マッチペア数: ${totalMatchPairs}ペア`);
    console.log(`  会話が発生したペア数: ${pairsWithConversation}ペア`);
    console.log(`  総メッセージ交換数: ${totalMessageExchanges}回`);

    // CSVファイルに出力
    const csvLines = [
      '指標,値',
      `総ダイレクトメッセージ数,${totalDirectMessages}件`,
      `1人あたり平均送信数,${avgMessagesPerUser}件（中央値：${medianMessages.toFixed(2)}件）`,
      `マッチ後に会話が発生した割合,${conversationRate}%`,
      `マッチ後の平均メッセージ交換回数,${avgMessageExchanges}回/ペア`,
      '',
      '詳細',
      `マッチペア数,${totalMatchPairs}ペア`,
      `会話が発生したペア数,${pairsWithConversation}ペア`,
      `総メッセージ交換数,${totalMessageExchanges}回`,
    ];

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'direct-message-stats.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'direct-message-stats.csv');
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

analyzeDirectMessageStats();

