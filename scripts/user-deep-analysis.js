// scripts/user-deep-analysis.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

async function analyzeUserDeep(userId) {
  try {
    console.log(`ユーザーID: ${userId}`);
    console.log('深層分析を実行中...');
    console.log('');

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

    const userCreatedAt = user.createdAt;
    const userCreatedAtJst = utcToJst(userCreatedAt);
    console.log(`ユーザー名: ${user.name}`);
    console.log(`登録日時: ${userCreatedAtJst.toISOString().replace('T', ' ').substring(0, 19)} (JST)`);
    console.log('');

    // 現在時刻（またはデータの最新時刻）を取得
    const now = new Date();
    
    // 登録日から現在までの日数を計算（登録日を含む）
    const daysSinceRegistration = Math.floor((now.getTime() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // 1. アクティブ日数（登録日から、セッションがあった日数）
    const userSessions = await prisma.userSession.findMany({
      where: {
        userId: userId,
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
    const activeDaysPercentage = (activeDaysCount / daysSinceRegistration * 100).toFixed(2);

    // 2. 総送信メッセージ数（isHidden=falseのみ）
    const totalSentMessages = await prisma.sentMessage.count({
      where: {
        senderId: userId,
        isHidden: false,
      },
    });

    // 3. 週あたり平均送信数
    const weeksSinceRegistration = daysSinceRegistration / 7;
    const avgMessagesPerWeek = weeksSinceRegistration > 0
      ? (totalSentMessages / weeksSinceRegistration).toFixed(2)
      : '0.00';

    // 4. 選択式：自作の比率
    // PresetMessageの内容を取得
    const presetMessages = await prisma.presetMessage.findMany({
      select: {
        content: true,
      },
    });
    const presetMessageContents = new Set(presetMessages.map(pm => pm.content));

    // 送信メッセージを取得
    const sentMessages = await prisma.sentMessage.findMany({
      where: {
        senderId: userId,
        isHidden: false,
      },
      select: {
        message: true,
      },
    });

    let presetCount = 0;
    let customCount = 0;
    sentMessages.forEach((msg) => {
      if (presetMessageContents.has(msg.message)) {
        presetCount++;
      } else {
        customCount++;
      }
    });

    const presetCustomRatio = totalSentMessages > 0
      ? `${presetCount}：${customCount}`
      : '0：0';

    // 5. 総マッチ回数
    const totalMatches = await prisma.matchPair.count({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId },
        ],
      },
    });

    // 6. マッチ率
    const matchRate = totalSentMessages > 0
      ? (totalMatches / totalSentMessages * 100).toFixed(2)
      : '0.00';

    // 7. 送信先ユニーク数
    const uniqueReceivers = await prisma.sentMessage.findMany({
      where: {
        senderId: userId,
        isHidden: false,
      },
      select: {
        receiverId: true,
      },
      distinct: ['receiverId'],
    });
    const uniqueReceiverCount = uniqueReceivers.length;

    // 結果を表示
    console.log('=== 深層分析結果 ===');
    console.log(`アクティブ日数: ${activeDaysCount}日（${activeDaysPercentage}%）`);
    console.log(`  登録からの日数: ${daysSinceRegistration}日`);
    console.log(`総送信メッセージ数: ${totalSentMessages}件`);
    console.log(`週あたり平均送信数: ${avgMessagesPerWeek}件`);
    console.log(`選択式：自作の比率: ${presetCustomRatio}`);
    console.log(`  選択式（PresetMessage）: ${presetCount}件`);
    console.log(`  自作メッセージ: ${customCount}件`);
    console.log(`総マッチ回数: ${totalMatches}回`);
    console.log(`マッチ率: ${matchRate}%`);
    console.log(`送信先ユニーク数: ${uniqueReceiverCount}人`);

    // CSVファイルに出力
    const csvLines = [
      '指標,値',
      `アクティブ日数,${activeDaysCount}日（${activeDaysPercentage}%）`,
      `登録からの日数,${daysSinceRegistration}日`,
      `総送信メッセージ数,${totalSentMessages}件`,
      `週あたり平均送信数,${avgMessagesPerWeek}件`,
      `選択式：自作の比率,${presetCustomRatio}`,
      `選択式（PresetMessage）,${presetCount}件`,
      `自作メッセージ,${customCount}件`,
      `総マッチ回数,${totalMatches}回`,
      `マッチ率,${matchRate}%`,
      `送信先ユニーク数,${uniqueReceiverCount}人`,
    ];

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', `user-deep-analysis-${userId}.csv`);
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', `user-deep-analysis-${userId}.csv`);
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
const userId = process.argv[2] || '9c531295-743d-4f67-be2d-1ea9a39891d1';

analyzeUserDeep(userId);

