// scripts/mutual-send-no-match.js

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

async function analyzeMutualSendNoMatch() {
  try {
    console.log('お互いに送り合っているのにマッチしていないペアを集計中...');
    console.log('');

    // 全SentMessageを取得（除外ユーザーを除く、isHidden=false）
    const allSentMessages = await prisma.sentMessage.findMany({
      where: {
        senderId: {
          notIn: EXCLUDED_USER_IDS,
        },
        receiverId: {
          notIn: EXCLUDED_USER_IDS,
        },
        isHidden: false,
      },
      select: {
        senderId: true,
        receiverId: true,
      },
    });

    console.log(`総SentMessage数: ${allSentMessages.length}件`);
    console.log('');

    // 各ユーザーペアについて、双方向にメッセージが送られているかを確認
    const pairMessages = new Map(); // key: "userId1|userId2" (sorted), value: { user1ToUser2: boolean, user2ToUser1: boolean }

    allSentMessages.forEach((msg) => {
      const pairKey = msg.senderId < msg.receiverId
        ? `${msg.senderId}|${msg.receiverId}`
        : `${msg.receiverId}|${msg.senderId}`;
      
      if (!pairMessages.has(pairKey)) {
        pairMessages.set(pairKey, {
          user1Id: msg.senderId < msg.receiverId ? msg.senderId : msg.receiverId,
          user2Id: msg.senderId < msg.receiverId ? msg.receiverId : msg.senderId,
          user1ToUser2: false,
          user2ToUser1: false,
        });
      }

      const pair = pairMessages.get(pairKey);
      if (msg.senderId === pair.user1Id) {
        pair.user1ToUser2 = true;
      } else {
        pair.user2ToUser1 = true;
      }
    });

    console.log(`ユニークなペア数: ${pairMessages.size}ペア`);
    console.log('');

    // 双方向に送っているペアを抽出
    const mutualSendPairs = [];
    pairMessages.forEach((pair, pairKey) => {
      if (pair.user1ToUser2 && pair.user2ToUser1) {
        mutualSendPairs.push({
          user1Id: pair.user1Id,
          user2Id: pair.user2Id,
        });
      }
    });

    console.log(`双方向に送っているペア数: ${mutualSendPairs.length}ペア`);
    console.log('');

    // 全マッチペアを取得
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
        user1Id: true,
        user2Id: true,
      },
    });

    // マッチしているペアをSetに格納（正規化）
    const matchedPairs = new Set();
    allMatches.forEach((match) => {
      const pairKey = match.user1Id < match.user2Id
        ? `${match.user1Id}|${match.user2Id}`
        : `${match.user2Id}|${match.user1Id}`;
      matchedPairs.add(pairKey);
    });

    console.log(`マッチしているペア数: ${matchedPairs.size}ペア`);
    console.log('');

    // 双方向に送っているがマッチしていないペアを抽出
    const mutualSendNoMatchPairs = [];
    mutualSendPairs.forEach((pair) => {
      const pairKey = `${pair.user1Id}|${pair.user2Id}`;
      if (!matchedPairs.has(pairKey)) {
        mutualSendNoMatchPairs.push(pair);
      }
    });

    console.log('=== 結果 ===');
    console.log(`お互いに送り合っているのにマッチしていないペア数: ${mutualSendNoMatchPairs.length}ペア`);
    console.log(`双方向に送っているペア数: ${mutualSendPairs.length}ペア`);
    console.log(`マッチしているペア数: ${matchedPairs.size}ペア`);
    console.log(`マッチ率（双方向送信ペア中）: ${mutualSendPairs.length > 0 ? (matchedPairs.size / mutualSendPairs.length * 100).toFixed(2) : '0.00'}%`);
    console.log('');

    // ユーザー情報を取得して表示
    const userIds = new Set();
    mutualSendNoMatchPairs.forEach((pair) => {
      userIds.add(pair.user1Id);
      userIds.add(pair.user2Id);
    });

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: Array.from(userIds),
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const userMap = new Map();
    users.forEach((user) => {
      userMap.set(user.id, user.name);
    });

    // CSVファイルに出力
    const csvLines = [
      'ユーザー1ID,ユーザー1名,ユーザー2ID,ユーザー2名',
    ];

    mutualSendNoMatchPairs.forEach((pair) => {
      const userName1 = userMap.get(pair.user1Id) || '不明';
      const userName2 = userMap.get(pair.user2Id) || '不明';
      csvLines.push([
        pair.user1Id,
        `"${userName1}"`,
        pair.user2Id,
        `"${userName2}"`,
      ].join(','));
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'mutual-send-no-match.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'mutual-send-no-match.csv');
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);
    console.log('');
    console.log(`詳細: ${mutualSendNoMatchPairs.length}ペアのリストをCSVに出力しました`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeMutualSendNoMatch();

