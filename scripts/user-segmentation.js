// scripts/user-segmentation.js

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

// UTC日付をJSTに変換（表示用）
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

async function analyzeUserSegmentation() {
  try {
    // 期間: JST 11/3 00:00 ～ 12/2 23:59:59
    const startJst = { year: 2025, month: 11, day: 3, hour: 0, minute: 0, second: 0 };
    const endJst = { year: 2025, month: 12, day: 2, hour: 23, minute: 59, second: 59 };
    
    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, startJst.hour, startJst.minute, startJst.second);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, endJst.hour, endJst.minute, endJst.second);

    const daysInPeriod = Math.floor((endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const weeksInPeriod = daysInPeriod / 7;

    console.log('期間: JST 11/3 00:00 ～ 12/2 23:59:59');
    console.log(`期間: ${daysInPeriod}日（${weeksInPeriod.toFixed(2)}週）`);
    console.log('ユーザー層分類を実行中...');
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
        email: true,
        createdAt: true,
      },
    });

    console.log(`対象ユーザー数: ${allUsers.length}人`);
    console.log('');

    // 期間を週ごとに分割
    const weeks = [];
    let currentWeekStart = new Date(startUtc);
    while (currentWeekStart <= endUtc) {
      const weekEnd = new Date(currentWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const weekEndActual = weekEnd > endUtc ? endUtc : weekEnd;
      weeks.push({
        start: new Date(currentWeekStart),
        end: new Date(weekEndActual),
      });
      currentWeekStart = weekEnd;
    }

    console.log(`週数: ${weeks.length}週`);
    console.log('');

    // 各ユーザーの統計を集計
    const userStats = [];

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      
      // 期間内の送信数（SentMessage）
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

      // 週ごとのメッセージ種類数を集計
      const messageTypesPerWeek = [];
      
      for (const week of weeks) {
        const weekMessages = await prisma.sentMessage.findMany({
          where: {
            senderId: user.id,
            createdAt: {
              gte: week.start,
              lte: week.end,
            },
            isHidden: false,
          },
          select: {
            message: true,
          },
          distinct: ['message'],
        });
        
        messageTypesPerWeek.push(weekMessages.length);
      }

      // 週あたりの平均メッセージ種類数
      const avgMessageTypesPerWeek = messageTypesPerWeek.length > 0
        ? messageTypesPerWeek.reduce((sum, count) => sum + count, 0) / messageTypesPerWeek.length
        : 0;
      
      // 週ごとに5種以上送信した週の数
      const weeksWith5OrMoreTypes = messageTypesPerWeek.filter(count => count >= 5).length;

      // 期間内のマッチ数
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

      // 期間内のログイン回数（UserSession）
      const loginCount = await prisma.userSession.count({
        where: {
          userId: user.id,
          startTime: {
            gte: startUtc,
            lte: endUtc,
          },
        },
      });

      // 週あたりのログイン回数
      const loginsPerWeek = weeksInPeriod > 0 ? loginCount / weeksInPeriod : 0;

      // フィード閲覧回数（直接計測されていないため、アクティブ日数を代理指標として使用）
      // アクティブ日数 = ログインした日数（セッションがあった日数）
      const activeDays = await prisma.userSession.findMany({
        where: {
          userId: user.id,
          startTime: {
            gte: startUtc,
            lte: endUtc,
          },
        },
        select: {
          startTime: true,
        },
      });

      // セッションがあった日を集計（JST基準）
      const activeDaysSet = new Set();
      activeDays.forEach((session) => {
        const jstDate = new Date(session.startTime.getTime() + 9 * 60 * 60 * 1000);
        const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
        activeDaysSet.add(dateKey);
      });
      const activeDaysCount = activeDaysSet.size;
      
      // 週あたりのアクティブ日数（フィード閲覧の代理指標）
      const activeDaysPerWeek = weeksInPeriod > 0 ? activeDaysCount / weeksInPeriod : 0;

      userStats.push({
        userId: user.id,
        userName: user.name,
        avgMessageTypesPerWeek,
        weeksWith5OrMoreTypes,
        messageTypesPerWeek,
        matchCount,
        loginsPerWeek,
        activeDaysPerWeek,
        activeDaysCount,
        loginCount,
      });

      // 進捗表示
      if ((i + 1) % 20 === 0 || i === allUsers.length - 1) {
        console.log(`処理中: ${i + 1}/${allUsers.length} ユーザー`);
      }
    }

    console.log('');
    console.log('統計を集計中...');

    // ユーザー層分類の基準を設定（メッセージ種類数ベース）
    // ヘビー: 毎週5種以上送信した週が3週以上（または4週中3週以上）
    // ミドル: 毎週3-4種以上送信した週が2週以上、または平均で週3-4種以上
    // ライト: 毎週1-2種以上送信した週が1週以上、または平均で週1-2種以上
    // 観察層: 送信ほぼなし（週1種未満）だがログイン継続（週1回以上）
    // 離脱層: ログインもほぼなし（週1回未満）

    const HEAVY_WEEKS_THRESHOLD = 3; // 5種以上送信した週が3週以上
    const MIDDLE_WEEKS_THRESHOLD = 2; // 3種以上送信した週が2週以上
    const LIGHT_WEEKS_THRESHOLD = 1; // 1種以上送信した週が1週以上
    const HEAVY_TYPES_PER_WEEK = 5; // 週5種以上
    const MIDDLE_TYPES_PER_WEEK = 3; // 週3種以上
    const LIGHT_TYPES_PER_WEEK = 1; // 週1種以上
    const LOGIN_THRESHOLD = 1; // 週1回以上

    const segments = {
      heavy: [],
      middle: [],
      light: [],
      observer: [],
      churn: [],
    };

    userStats.forEach((stat) => {
      // ヘビー: 5種以上送信した週が3週以上
      if (stat.weeksWith5OrMoreTypes >= HEAVY_WEEKS_THRESHOLD) {
        segments.heavy.push(stat);
      } 
      // ミドル: 3種以上送信した週が2週以上、または平均で週3種以上
      else if (stat.weeksWith5OrMoreTypes >= 0 && 
               stat.messageTypesPerWeek.filter(count => count >= MIDDLE_TYPES_PER_WEEK).length >= MIDDLE_WEEKS_THRESHOLD ||
               stat.avgMessageTypesPerWeek >= MIDDLE_TYPES_PER_WEEK) {
        segments.middle.push(stat);
      } 
      // ライト: 1種以上送信した週が1週以上、または平均で週1種以上
      else if (stat.messageTypesPerWeek.filter(count => count >= LIGHT_TYPES_PER_WEEK).length >= LIGHT_WEEKS_THRESHOLD ||
               stat.avgMessageTypesPerWeek >= LIGHT_TYPES_PER_WEEK) {
        segments.light.push(stat);
      } 
      // 観察層: 送信ほぼなしだがログイン継続
      else if (stat.loginsPerWeek >= LOGIN_THRESHOLD) {
        segments.observer.push(stat);
      } 
      // 離脱層: ログインもほぼなし
      else {
        segments.churn.push(stat);
      }
    });

    // 各層の統計を計算
    const segmentStats = {};

    Object.keys(segments).forEach((segmentKey) => {
      const segmentUsers = segments[segmentKey];
      if (segmentUsers.length === 0) {
        segmentStats[segmentKey] = {
          count: 0,
          avgSentPerWeek: 0,
          avgMatches: 0,
          avgLoginsPerWeek: 0,
          avgFeedViews: 0,
        };
        return;
      }

      const avgSentPerWeek = segmentUsers.reduce((sum, u) => sum + u.avgMessageTypesPerWeek, 0) / segmentUsers.length;
      const avgMatches = segmentUsers.reduce((sum, u) => sum + (u.matchCount / weeksInPeriod), 0) / segmentUsers.length;
      const avgLoginsPerWeek = segmentUsers.reduce((sum, u) => sum + u.loginsPerWeek, 0) / segmentUsers.length;
      const avgFeedViews = segmentUsers.reduce((sum, u) => sum + u.activeDaysPerWeek, 0) / segmentUsers.length;

      segmentStats[segmentKey] = {
        count: segmentUsers.length,
        avgSentPerWeek: parseFloat(avgSentPerWeek.toFixed(2)),
        avgMatches: parseFloat(avgMatches.toFixed(2)),
        avgLoginsPerWeek: parseFloat(avgLoginsPerWeek.toFixed(2)),
        avgFeedViews: parseFloat(avgFeedViews.toFixed(2)),
      };
    });

    // 結果を表示
    console.log('');
    console.log('=== ユーザー層分類結果 ===');
    console.log('');
    console.log('【分類基準】');
    console.log('ヘビーユーザー: 毎週5種以上送信した週が3週以上');
    console.log('ミドルユーザー: 毎週3-4種以上送信した週が2週以上、または平均で週3種以上');
    console.log('ライトユーザー: 毎週1-2種以上送信した週が1週以上、または平均で週1種以上');
    console.log('観察層: 送信ほぼなし（週1種未満）だがログイン継続（週1回以上）');
    console.log('離脱層: ログインもほぼなし（週1回未満）');
    console.log('');

    const segmentNames = {
      heavy: 'ヘビーユーザー',
      middle: 'ミドルユーザー',
      light: 'ライトユーザー',
      observer: '観察層',
      churn: '離脱層',
    };

    const segmentDefinitions = {
      heavy: '毎週5種以上送信した週が3週以上',
      middle: '毎週3-4種以上送信した週が2週以上',
      light: '毎週1-2種以上送信した週が1週以上',
      observer: '送信ほぼなし、ログイン継続',
      churn: 'ログインもほぼなし',
    };

    console.log('表6.8 ユーザー層の分類と分布');
    console.log('ユーザー層 | 定義 | 人数 | 割合');
    console.log('----------------------------------------');
    Object.keys(segments).forEach((key) => {
      const stat = segmentStats[key];
      const percentage = (stat.count / allUsers.length * 100).toFixed(1);
      console.log(`${segmentNames[key]} | ${segmentDefinitions[key]} | ${stat.count}人 | ${percentage}%`);
    });
    console.log('');

    console.log('表6.9 ユーザー層別の行動特性');
    console.log('指標 | ヘビー | ミドル | ライト | 観察層 | 離脱層');
    console.log('----------------------------------------');
    console.log(`平均メッセージ種類数/週 | ${segmentStats.heavy.avgSentPerWeek} | ${segmentStats.middle.avgSentPerWeek} | ${segmentStats.light.avgSentPerWeek} | ${segmentStats.observer.avgSentPerWeek} | ${segmentStats.churn.avgSentPerWeek}`);
    console.log(`平均マッチ回数/週 | ${segmentStats.heavy.avgMatches.toFixed(2)} | ${segmentStats.middle.avgMatches.toFixed(2)} | ${segmentStats.light.avgMatches.toFixed(2)} | ${segmentStats.observer.avgMatches.toFixed(2)} | ${segmentStats.churn.avgMatches.toFixed(2)}`);
    console.log(`平均ログイン回数/週 | ${segmentStats.heavy.avgLoginsPerWeek} | ${segmentStats.middle.avgLoginsPerWeek} | ${segmentStats.light.avgLoginsPerWeek} | ${segmentStats.observer.avgLoginsPerWeek} | ${segmentStats.churn.avgLoginsPerWeek}`);
    console.log(`平均アクティブ日数/週 | ${segmentStats.heavy.avgFeedViews.toFixed(2)} | ${segmentStats.middle.avgFeedViews.toFixed(2)} | ${segmentStats.light.avgFeedViews.toFixed(2)} | ${segmentStats.observer.avgFeedViews.toFixed(2)} | ${segmentStats.churn.avgFeedViews.toFixed(2)}`);

    // CSVファイルに出力
    const csvLines = [
      '表6.8 ユーザー層の分類と分布',
      'ユーザー層,定義,人数,割合',
    ];

    Object.keys(segments).forEach((key) => {
      const stat = segmentStats[key];
      const percentage = (stat.count / allUsers.length * 100).toFixed(1);
      csvLines.push(`${segmentNames[key]},${segmentDefinitions[key]},${stat.count}人,${percentage}%`);
    });

    csvLines.push('');
    csvLines.push('表6.9 ユーザー層別の行動特性');
    csvLines.push('指標,ヘビー,ミドル,ライト,観察層,離脱層');
    csvLines.push(`平均メッセージ種類数/週,${segmentStats.heavy.avgSentPerWeek},${segmentStats.middle.avgSentPerWeek},${segmentStats.light.avgSentPerWeek},${segmentStats.observer.avgSentPerWeek},${segmentStats.churn.avgSentPerWeek}`);
    csvLines.push(`平均マッチ回数/週,${segmentStats.heavy.avgMatches.toFixed(2)},${segmentStats.middle.avgMatches.toFixed(2)},${segmentStats.light.avgMatches.toFixed(2)},${segmentStats.observer.avgMatches.toFixed(2)},${segmentStats.churn.avgMatches.toFixed(2)}`);
    csvLines.push(`平均ログイン回数/週,${segmentStats.heavy.avgLoginsPerWeek},${segmentStats.middle.avgLoginsPerWeek},${segmentStats.light.avgLoginsPerWeek},${segmentStats.observer.avgLoginsPerWeek},${segmentStats.churn.avgLoginsPerWeek}`);
    csvLines.push(`平均アクティブ日数/週,${segmentStats.heavy.avgFeedViews.toFixed(2)},${segmentStats.middle.avgFeedViews.toFixed(2)},${segmentStats.light.avgFeedViews.toFixed(2)},${segmentStats.observer.avgFeedViews.toFixed(2)},${segmentStats.churn.avgFeedViews.toFixed(2)}`);

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'user-segmentation.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'user-segmentation.csv');
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

analyzeUserSegmentation();

