// scripts/user-match-statistics.js

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// JST日付をUTCに変換（JST = UTC+9）
function jstToUtc(jstYear, jstMonth, jstDay, hour = 0, minute = 0, second = 0) {
  const jstDate = new Date(Date.UTC(jstYear, jstMonth - 1, jstDay, hour, minute, second));
  return new Date(jstDate.getTime() - 9 * 60 * 60 * 1000);
}

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

// 日数の差を計算（JST基準、登録日を含む）
function calculateDaysSinceRegistration(userCreatedAt, endDate) {
  const userJst = utcToJst(userCreatedAt);
  const endJst = utcToJst(endDate);
  const diffTime = endJst.getTime() - userJst.getTime();
  // 登録日を含めるため、計算結果に1を足す
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

async function analyzeUserMatchStatistics() {
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

    // 全ユーザーを取得
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log(`総ユーザー数: ${allUsers.length}`);
    console.log('');

    // 各ユーザーの統計を計算
    const userStats = [];

    for (const user of allUsers) {
      // 登録してからの日数（期間終了日時点）
      const daysSinceRegistration = calculateDaysSinceRegistration(user.createdAt, endUtc);

      // UserSessionの回数（期間内）
      const sessionCount = await prisma.userSession.count({
        where: {
          userId: user.id,
          startTime: {
            gte: startUtc,
            lte: endUtc,
          },
        },
      });

      // マッチ用メッセージの送信回数（期間内、isHidden=falseのみ）
      const sentMessageCount = await prisma.sentMessage.count({
        where: {
          senderId: user.id,
          createdAt: {
            gte: startUtc,
            lte: endUtc,
          },
          isHidden: false,
        },
      });

      // 送信先人数の合計（期間内、isHidden=falseのみ、ユニークなreceiverId）
      const uniqueReceivers = await prisma.sentMessage.findMany({
        where: {
          senderId: user.id,
          createdAt: {
            gte: startUtc,
            lte: endUtc,
          },
          isHidden: false,
        },
        select: {
          receiverId: true,
        },
        distinct: ['receiverId'],
      });
      const receiverCount = uniqueReceivers.length;

      // マッチ数の合計（期間内、user1Idまたはuser2Idが該当）
      const matchCount = await prisma.matchPair.count({
        where: {
          OR: [
            { user1Id: user.id },
            { user2Id: user.id },
          ],
          matchedAt: {
            gte: startUtc,
            lte: endUtc,
          },
        },
      });

      userStats.push({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        registeredAt: user.createdAt,
        daysSinceRegistration,
        sessionCount,
        sentMessageCount,
        receiverCount,
        matchCount,
      });

      // 進捗表示
      if (userStats.length % 10 === 0) {
        console.log(`処理中: ${userStats.length}/${allUsers.length} ユーザー`);
      }
    }

    console.log(`処理完了: ${userStats.length} ユーザー`);
    console.log('');

    // CSVファイルに出力
    const csvLines = [
      'ユーザーID,ユーザー名,メールアドレス,登録日時(JST),登録からの日数,セッション回数,マッチメッセージ送信数,送信先人数,マッチ数'
    ];

    userStats.forEach((stat) => {
      const registeredAtJst = utcToJst(stat.registeredAt);
      const registeredAtStr = registeredAtJst.toISOString().replace('T', ' ').substring(0, 19);
      
      csvLines.push([
        stat.userId,
        `"${stat.userName}"`,
        stat.userEmail,
        registeredAtStr,
        stat.daysSinceRegistration,
        stat.sessionCount,
        stat.sentMessageCount,
        stat.receiverCount,
        stat.matchCount,
      ].join(','));
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'user-match-statistics.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log('');

    // サマリー統計を計算
    const totalSentMessages = userStats.reduce((sum, s) => sum + s.sentMessageCount, 0);
    const totalReceivers = userStats.reduce((sum, s) => sum + s.receiverCount, 0);
    const totalMatches = userStats.reduce((sum, s) => sum + s.matchCount, 0);
    const totalSessions = userStats.reduce((sum, s) => sum + s.sessionCount, 0);

    const sentMessageCounts = userStats.map(s => s.sentMessageCount).filter(c => c > 0);
    const avgSentMessages = sentMessageCounts.length > 0 
      ? (totalSentMessages / sentMessageCounts.length).toFixed(2)
      : '0.00';
    
    // 中央値の計算
    const sortedCounts = [...sentMessageCounts].sort((a, b) => a - b);
    const medianSentMessages = sortedCounts.length > 0
      ? (sortedCounts.length % 2 === 0
          ? ((sortedCounts[sortedCounts.length / 2 - 1] + sortedCounts[sortedCounts.length / 2]) / 2).toFixed(2)
          : sortedCounts[Math.floor(sortedCounts.length / 2)].toString())
      : '0';
    
    const maxSentMessages = sentMessageCounts.length > 0
      ? Math.max(...sentMessageCounts).toString()
      : '0';

    console.log('=== サマリー統計 ===');
    console.log(`① マッチ用メッセージの総送信数: ${totalSentMessages}`);
    console.log(`② 1人あたりのマッチ用メッセージ平均送信数:`);
    console.log(`   平均: ${avgSentMessages}`);
    console.log(`   中央値: ${medianSentMessages}`);
    console.log(`   最大値: ${maxSentMessages}`);
    console.log(`④ 送信先人数の合計: ${totalReceivers}`);
    console.log(`   総マッチ数: ${totalMatches}`);
    console.log(`   総セッション数: ${totalSessions}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeUserMatchStatistics();

