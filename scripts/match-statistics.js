// scripts/match-statistics.js

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

async function analyzeMatchStatistics() {
  try {
    console.log('マッチ統計を集計中...');
    console.log('');

    // 1. 総マッチ件数（除外ユーザーを除く）
    const allMatches = await prisma.matchPair.findMany({
      where: {
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
        id: true,
        user1Id: true,
        user2Id: true,
        matchedAt: true,
      },
      orderBy: {
        matchedAt: 'asc',
      },
    });

    const totalMatches = allMatches.length;
    console.log(`総マッチ件数: ${totalMatches}件`);

    // 2. 1日あたり平均マッチ件数
    if (allMatches.length > 0) {
      const firstMatch = allMatches[0];
      const lastMatch = allMatches[allMatches.length - 1];
      const daysDiff = Math.floor((lastMatch.matchedAt.getTime() - firstMatch.matchedAt.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const avgMatchesPerDay = (totalMatches / daysDiff).toFixed(2);
      console.log(`1日あたり平均マッチ件数: ${avgMatchesPerDay}件/日`);
      console.log(`  期間: ${daysDiff}日`);
    }

    // 3. 全体マッチ率（マッチ数/送信数）
    const totalSentMessages = await prisma.sentMessage.count({
      where: {
        senderId: {
          notIn: EXCLUDED_USER_IDS,
        },
        isHidden: false,
      },
    });
    const matchRate = totalSentMessages > 0
      ? (totalMatches / totalSentMessages * 100).toFixed(2)
      : '0.00';
    console.log(`全体マッチ率（マッチ数/送信数）: ${matchRate}%`);
    console.log(`  総送信数: ${totalSentMessages}件`);

    // 4. 1人あたり平均マッチ回数と中央値、最大値
    const userMatchCounts = new Map();
    allMatches.forEach((match) => {
      // user1Idのマッチ数をカウント
      userMatchCounts.set(match.user1Id, (userMatchCounts.get(match.user1Id) || 0) + 1);
      // user2Idのマッチ数をカウント
      userMatchCounts.set(match.user2Id, (userMatchCounts.get(match.user2Id) || 0) + 1);
    });

    const matchCounts = Array.from(userMatchCounts.values()).sort((a, b) => a - b);
    const totalUsers = matchCounts.length;
    const avgMatchesPerUser = totalUsers > 0
      ? (matchCounts.reduce((sum, count) => sum + count, 0) / totalUsers).toFixed(2)
      : '0.00';
    
    // 中央値の計算
    let medianMatches = 0;
    if (matchCounts.length > 0) {
      const mid = Math.floor(matchCounts.length / 2);
      if (matchCounts.length % 2 === 0) {
        medianMatches = (matchCounts[mid - 1] + matchCounts[mid]) / 2;
      } else {
        medianMatches = matchCounts[mid];
      }
    }
    
    const maxMatchesPerUser = matchCounts.length > 0 ? Math.max(...matchCounts) : 0;

    console.log(`1人あたり平均マッチ回数: ${avgMatchesPerUser}回（中央値：${medianMatches.toFixed(2)}回）`);
    console.log(`1人あたり最大マッチ回数: ${maxMatchesPerUser}回`);
    console.log(`  マッチしたユーザー数: ${totalUsers}人`);

    // 5. 初回マッチとリピートマッチの集計
    // ペアを正規化（小さいIDを先に）
    const pairMatches = new Map(); // key: "userId1|userId2" (sorted), value: count
    
    allMatches.forEach((match) => {
      const pairKey = match.user1Id < match.user2Id
        ? `${match.user1Id}|${match.user2Id}`
        : `${match.user2Id}|${match.user1Id}`;
      pairMatches.set(pairKey, (pairMatches.get(pairKey) || 0) + 1);
    });

    let firstMatches = 0;
    let repeatMatches = 0;

    pairMatches.forEach((count) => {
      firstMatches += 1; // 各ペアの初回マッチは1件
      if (count > 1) {
        repeatMatches += count - 1; // 2回目以降のマッチ
      }
    });

    const firstMatchRate = totalMatches > 0
      ? (firstMatches / totalMatches * 100).toFixed(2)
      : '0.00';
    const repeatMatchRate = totalMatches > 0
      ? (repeatMatches / totalMatches * 100).toFixed(2)
      : '0.00';

    console.log(`初回マッチ: ${firstMatches}件（${firstMatchRate}%）`);
    console.log(`リピートマッチ（同じペアの2回目以降）: ${repeatMatches}件（${repeatMatchRate}%）`);
    console.log(`  ユニークなペア数: ${pairMatches.size}ペア`);

    // 結果を表示
    console.log('');
    console.log('=== 結果サマリー ===');
    console.log(`総マッチ件数: ${totalMatches}件`);
    if (allMatches.length > 0) {
      const firstMatch = allMatches[0];
      const lastMatch = allMatches[allMatches.length - 1];
      const daysDiff = Math.floor((lastMatch.matchedAt.getTime() - firstMatch.matchedAt.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const avgMatchesPerDay = (totalMatches / daysDiff).toFixed(2);
      console.log(`1日あたり平均マッチ件数: ${avgMatchesPerDay}件/日`);
    }
    console.log(`全体マッチ率（マッチ数/送信数）: ${matchRate}%`);
    console.log(`1人あたり平均マッチ回数: ${avgMatchesPerUser}回（中央値：${medianMatches.toFixed(2)}回）`);
    console.log(`1人あたり最大マッチ回数: ${maxMatchesPerUser}回`);
    console.log(`初回マッチ: ${firstMatches}件（${firstMatchRate}%）`);
    console.log(`リピートマッチ（同じペアの2回目以降）: ${repeatMatches}件（${repeatMatchRate}%）`);

    // CSVファイルに出力
    const csvLines = [
      '指標,値',
      `総マッチ件数,${totalMatches}件`,
    ];

    if (allMatches.length > 0) {
      const firstMatch = allMatches[0];
      const lastMatch = allMatches[allMatches.length - 1];
      const daysDiff = Math.floor((lastMatch.matchedAt.getTime() - firstMatch.matchedAt.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const avgMatchesPerDay = (totalMatches / daysDiff).toFixed(2);
      csvLines.push(`1日あたり平均マッチ件数,${avgMatchesPerDay}件/日`);
    }

    csvLines.push(
      `全体マッチ率（マッチ数/送信数）,${matchRate}%`,
      `1人あたり平均マッチ回数,${avgMatchesPerUser}回（中央値：${medianMatches.toFixed(2)}回）`,
      `1人あたり最大マッチ回数,${maxMatchesPerUser}回`,
      `初回マッチ,${firstMatches}件（${firstMatchRate}%）`,
      `リピートマッチ（同じペアの2回目以降）,${repeatMatches}件（${repeatMatchRate}%）`,
      '',
      '詳細',
      `総送信数,${totalSentMessages}件`,
      `マッチしたユーザー数,${totalUsers}人`,
      `ユニークなペア数,${pairMatches.size}ペア`,
    );

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'match-statistics.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'match-statistics.csv');
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

analyzeMatchStatistics();

