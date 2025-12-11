// scripts/user-period-analysis.js

import { config } from "dotenv";
config();

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

async function analyzeUserPeriod(userId, startJst, endJst) {
  try {
    console.log(`ユーザーID: ${userId}`);
    console.log(`対象期間: JST ${startJst.year}/${startJst.month}/${startJst.day} ～ ${endJst.year}/${endJst.month}/${endJst.day}`);
    console.log('詳細分析を実行中...');
    console.log('');

    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, 0, 0, 0);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, 23, 59, 59);

    // ユーザー情報を取得
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    if (!user) {
      console.error('ユーザーが見つかりません');
      return;
    }

    console.log(`ユーザー名: ${user.name}`);
    console.log('');

    // 期間内の日数を計算
    const daysInPeriod = Math.floor((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const weeksInPeriod = daysInPeriod / 7;

    // 1. アクティブ日数（期間内でセッションがあった日数）
    const userSessions = await prisma.userSession.findMany({
      where: {
        userId: userId,
        startTime: {
          gte: startUtc,
          lte: endUtc,
        },
      },
      select: {
        startTime: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // セッションがあった日を集計（JST基準）
    const activeDays = new Set();
    userSessions.forEach((session) => {
      const jstDate = utcToJst(session.startTime);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      activeDays.add(dateKey);
    });

    const activeDaysCount = activeDays.size;
    const activeDaysPercentage = (activeDaysCount / daysInPeriod * 100).toFixed(2);
    const avgSessionsPerDay = activeDaysCount > 0 ? (userSessions.length / activeDaysCount).toFixed(2) : '0.00';

    // 2. 送信したマッチ用メッセージ総数（期間内、isHidden=falseのみ）
    const sentMessages = await prisma.sentMessage.findMany({
      where: {
        senderId: userId,
        isHidden: false,
        createdAt: {
          gte: startUtc,
          lte: endUtc,
        },
      },
      select: {
        message: true,
        receiverId: true,
        createdAt: true,
      },
    });

    const totalSentMessages = sentMessages.length;

    // 3. 送信したマッチ用メッセージ総種数と自作割合
    // PresetMessageの内容を取得
    const presetMessages = await prisma.presetMessage.findMany({
      select: {
        content: true,
      },
    });
    const presetMessageContents = new Set(presetMessages.map(pm => pm.content));

    // メッセージの種類を集計
    const messageTypes = new Set();
    const customMessageTypes = new Set();
    let presetCount = 0;
    let customCount = 0;

    sentMessages.forEach((msg) => {
      messageTypes.add(msg.message);
      if (presetMessageContents.has(msg.message)) {
        presetCount++;
      } else {
        customCount++;
        customMessageTypes.add(msg.message);
      }
    });

    const totalMessageTypes = messageTypes.size;
    const customMessageTypesCount = customMessageTypes.size;
    const presetMessageTypesCount = totalMessageTypes - customMessageTypesCount;
    const customRatio = totalSentMessages > 0 ? (customCount / totalSentMessages * 100).toFixed(1) : '0.0';

    // 4. 自作メッセージでマッチした回数
    // 期間内のマッチを取得
    const matches = await prisma.matchPair.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId },
        ],
        matchedAt: {
          gte: startUtc,
          lte: endUtc,
        },
      },
      select: {
        message: true,
      },
    });

    // 自作メッセージでマッチした回数をカウント
    let customMatchCount = 0;
    matches.forEach((match) => {
      if (!presetMessageContents.has(match.message)) {
        customMatchCount++;
      }
    });

    // 5. 平均送信先件数（1メッセージあたりの平均送信先数）
    // メッセージ内容ごとに送信先を集計
    const messageReceivers = new Map(); // key: message, value: Set<receiverId>
    sentMessages.forEach((msg) => {
      if (!messageReceivers.has(msg.message)) {
        messageReceivers.set(msg.message, new Set());
      }
      messageReceivers.get(msg.message).add(msg.receiverId);
    });

    let totalReceiverCount = 0;
    messageReceivers.forEach((receivers) => {
      totalReceiverCount += receivers.size;
    });
    const avgReceiversPerMessage = messageReceivers.size > 0
      ? (totalReceiverCount / messageReceivers.size).toFixed(1)
      : '0.0';

    // 6. 送信先ユニーク数（期間内）
    const uniqueReceivers = new Set(sentMessages.map(msg => msg.receiverId));
    const uniqueReceiverCount = uniqueReceivers.size;

    // 7. 週あたり平均送信数
    const avgMessagesPerWeek = weeksInPeriod > 0
      ? (totalSentMessages / weeksInPeriod).toFixed(2)
      : '0.00';

    // 8. 総マッチ回数（期間内）
    const totalMatches = matches.length;

    // 9. マッチ率
    const matchRate = totalSentMessages > 0
      ? (totalMatches / totalSentMessages * 100).toFixed(2)
      : '0.00';

    // 結果を表示
    console.log('=== 詳細分析結果 ===');
    console.log(`アクティブ日数: ${activeDaysCount}日（${activeDaysPercentage}%）`);
    console.log(`1日あたりのセッション回数平均: ${avgSessionsPerDay}回`);
    console.log(`送信したマッチ用メッセージ総数: ${totalSentMessages}件`);
    console.log(`送信したマッチ用メッセージ総種数: ${totalMessageTypes}種類（自作${customMessageTypesCount}種類）`);
    console.log(`自作メッセージでマッチした回数: ${customMatchCount}回`);
    console.log(`送信したマッチ用メッセージの自作割合: ${customRatio}%`);
    console.log(`平均送信先件数: ${avgReceiversPerMessage}人`);
    console.log(`送信先ユニーク数: ${uniqueReceiverCount}人`);
    console.log(`週あたり平均送信数: ${avgMessagesPerWeek}件`);
    console.log(`総マッチ回数: ${totalMatches}回`);
    console.log(`マッチ率: ${matchRate}%`);
    console.log('');
    console.log('=== 詳細内訳 ===');
    console.log(`期間内の日数: ${daysInPeriod}日`);
    console.log(`期間内の週数: ${weeksInPeriod.toFixed(2)}週`);
    console.log(`総セッション数: ${userSessions.length}回`);
    console.log(`選択式メッセージ数: ${presetCount}件`);
    console.log(`自作メッセージ数: ${customCount}件`);
    console.log(`選択式メッセージ種類数: ${presetMessageTypesCount}種類`);

    // CSVファイルに出力
    const csvLines = [
      '指標,値',
      `アクティブ日数,${activeDaysCount}日（${activeDaysPercentage}%）`,
      `1日あたりのセッション回数平均,${avgSessionsPerDay}回`,
      `送信したマッチ用メッセージ総数,${totalSentMessages}件`,
      `送信したマッチ用メッセージ総種数,${totalMessageTypes}種類（自作${customMessageTypesCount}種類）`,
      `自作メッセージでマッチした回数,${customMatchCount}回`,
      `送信したマッチ用メッセージの自作割合,${customRatio}%`,
      `平均送信先件数,${avgReceiversPerMessage}人`,
      `送信先ユニーク数,${uniqueReceiverCount}人`,
      `週あたり平均送信数,${avgMessagesPerWeek}件`,
      `総マッチ回数,${totalMatches}回`,
      `マッチ率,${matchRate}%`,
      '',
      '=== 詳細内訳 ===',
      `期間内の日数,${daysInPeriod}日`,
      `期間内の週数,${weeksInPeriod.toFixed(2)}週`,
      `総セッション数,${userSessions.length}回`,
      `選択式メッセージ数,${presetCount}件`,
      `自作メッセージ数,${customCount}件`,
      `選択式メッセージ種類数,${presetMessageTypesCount}種類`,
    ];

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', `user-period-analysis-${userId}.csv`);
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', `user-period-analysis-${userId}.csv`);
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

// コマンドライン引数からユーザーIDを取得
const userId = process.argv[2] || 'de06a56e-5390-4fa7-b9f6-4ff4c5807e1d';

// 期間: JST 11/3 00:00 ～ 12/2 23:59:59
const startJst = { year: 2025, month: 11, day: 3 };
const endJst = { year: 2025, month: 12, day: 2 };

analyzeUserPeriod(userId, startJst, endJst);

