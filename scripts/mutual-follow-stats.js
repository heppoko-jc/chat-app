// scripts/mutual-follow-stats.js

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

async function analyzeMutualFollowStats() {
  try {
    console.log('相互フォロー統計を計算中...');
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
      },
    });

    const totalUsers = allUsers.length;
    console.log(`対象ユーザー数: ${totalUsers}`);
    console.log('');

    // 全フォロー関係を取得（除外ユーザーを除く）
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
        friendId: true,
      },
    });

    const totalFollows = allFriends.length;
    console.log(`全フォロー数: ${totalFollows}`);
    console.log('');

    // フォロー関係をMapで管理（高速検索のため）
    const followMap = new Map(); // key: "userId|friendId", value: true
    
    allFriends.forEach((friend) => {
      const key = `${friend.userId}|${friend.friendId}`;
      followMap.set(key, true);
    });

    // 相互フォロー関係を検出
    const mutualFollows = new Set(); // 相互フォローペア（小さいID|大きいIDの形式で保存）
    let mutualFollowCount = 0;

    allFriends.forEach((friend) => {
      const key1 = `${friend.userId}|${friend.friendId}`;
      const key2 = `${friend.friendId}|${friend.userId}`;
      
      // 相互フォローかチェック
      if (followMap.has(key1) && followMap.has(key2)) {
        // ペアを一意に識別するため、IDをソート
        const pairKey = friend.userId < friend.friendId 
          ? `${friend.userId}|${friend.friendId}`
          : `${friend.friendId}|${friend.userId}`;
        
        if (!mutualFollows.has(pairKey)) {
          mutualFollows.add(pairKey);
          mutualFollowCount += 2; // 相互フォローは2つのフォロー関係
        }
      }
    });

    const mutualFollowPairs = mutualFollows.size;
    const oneWayFollows = totalFollows - mutualFollowCount;

    console.log('=== 結果 ===');
    console.log(`全ユーザー数: ${totalUsers}`);
    console.log(`全フォロー数: ${totalFollows}`);
    console.log(`相互フォローペア数: ${mutualFollowPairs}`);
    console.log(`相互フォロー関係数: ${mutualFollowCount}（${mutualFollowPairs}ペア × 2）`);
    console.log(`一方向フォロー数: ${oneWayFollows}`);
    console.log('');

    // 1. ユーザー全員の中で、相互フォロー率
    // 全ユーザーペア数 = nC2 = n * (n-1) / 2
    const totalPossiblePairs = (totalUsers * (totalUsers - 1)) / 2;
    const mutualFollowRateAmongUsers = (mutualFollowPairs / totalPossiblePairs * 100).toFixed(4);
    
    // または、フォローしているユーザーの中で相互フォローしている割合
    const usersWithFollows = new Set(allFriends.map(f => f.userId)).size;
    const usersWithMutualFollows = new Set();
    mutualFollows.forEach((pairKey) => {
      const [userId1, userId2] = pairKey.split('|');
      usersWithMutualFollows.add(userId1);
      usersWithMutualFollows.add(userId2);
    });
    const mutualFollowRateAmongActiveUsers = usersWithFollows > 0
      ? (usersWithMutualFollows.size / usersWithFollows * 100).toFixed(2)
      : '0.00';

    // 2. 全てのフォローの中で相互フォローの割合
    const mutualFollowRateAmongFollows = totalFollows > 0
      ? (mutualFollowCount / totalFollows * 100).toFixed(2)
      : '0.00';

    console.log('=== 統計 ===');
    console.log(`1. ユーザー全員の中で、相互フォロー率:`);
    console.log(`   全ユーザーペア数: ${totalPossiblePairs}`);
    console.log(`   相互フォローペア数: ${mutualFollowPairs}`);
    console.log(`   相互フォロー率: ${mutualFollowRateAmongUsers}%`);
    console.log('');
    console.log(`   フォローしているユーザー数: ${usersWithFollows}`);
    console.log(`   相互フォローしているユーザー数: ${usersWithMutualFollows.size}`);
    console.log(`   フォローしているユーザー中の相互フォロー率: ${mutualFollowRateAmongActiveUsers}%`);
    console.log('');
    console.log(`2. 全てのフォローの中で相互フォローの割合:`);
    console.log(`   全フォロー数: ${totalFollows}`);
    console.log(`   相互フォロー関係数: ${mutualFollowCount}`);
    console.log(`   相互フォローの割合: ${mutualFollowRateAmongFollows}%`);
    console.log(`   一方向フォローの割合: ${(100 - parseFloat(mutualFollowRateAmongFollows)).toFixed(2)}%`);

    // CSVファイルに出力
    const csvLines = [
      '指標,値',
      `全ユーザー数,${totalUsers}`,
      `全フォロー数,${totalFollows}`,
      `相互フォローペア数,${mutualFollowPairs}`,
      `相互フォロー関係数,${mutualFollowCount}`,
      `一方向フォロー数,${oneWayFollows}`,
      `全ユーザーペア数,${totalPossiblePairs}`,
      `相互フォロー率（全ユーザー中）,${mutualFollowRateAmongUsers}%`,
      `フォローしているユーザー数,${usersWithFollows}`,
      `相互フォローしているユーザー数,${usersWithMutualFollows.size}`,
      `相互フォロー率（フォローしているユーザー中）,${mutualFollowRateAmongActiveUsers}%`,
      `相互フォローの割合（全フォロー中）,${mutualFollowRateAmongFollows}%`,
      `一方向フォローの割合（全フォロー中）,${(100 - parseFloat(mutualFollowRateAmongFollows)).toFixed(2)}%`,
    ];

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'mutual-follow-stats.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'mutual-follow-stats.csv');
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

analyzeMutualFollowStats();

