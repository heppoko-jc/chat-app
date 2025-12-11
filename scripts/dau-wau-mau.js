// scripts/dau-wau-mau.js

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

async function calculateDAUWAUMAU() {
  try {
    // 対象期間: JST 10/13 00:00 から 12/2 23:59:59
    const startJst = { year: 2025, month: 10, day: 13, hour: 0, minute: 0, second: 0 };
    const endJst = { year: 2025, month: 12, day: 2, hour: 23, minute: 59, second: 59 };
    
    const startUtc = jstToUtc(startJst.year, startJst.month, startJst.day, startJst.hour, startJst.minute, startJst.second);
    const endUtc = jstToUtc(endJst.year, endJst.month, endJst.day, endJst.hour, endJst.minute, endJst.second);

    console.log('対象期間:');
    console.log(`  JST: ${startJst.year}/${startJst.month}/${startJst.day} 00:00:00 ～ ${endJst.year}/${endJst.month}/${endJst.day} 23:59:59`);
    console.log(`  UTC: ${startUtc.toISOString()} ～ ${endUtc.toISOString()}`);
    console.log('');

    // 期間内の全日付を生成
    const allDates = [];
    const currentDate = new Date(startUtc);
    while (currentDate <= endUtc) {
      const jstDate = utcToJst(currentDate);
      const dateKey = `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
      
      // その日の開始時刻（JST 00:00:00）をUTCに変換
      const dayStartJst = new Date(Date.UTC(
        jstDate.getUTCFullYear(),
        jstDate.getUTCMonth(),
        jstDate.getUTCDate(),
        0, 0, 0
      ));
      const dayStartUtc = new Date(dayStartJst.getTime() - 9 * 60 * 60 * 1000);
      
      // その日の終了時刻（JST 23:59:59.999）をUTCに変換
      const dayEndJst = new Date(Date.UTC(
        jstDate.getUTCFullYear(),
        jstDate.getUTCMonth(),
        jstDate.getUTCDate(),
        23, 59, 59, 999
      ));
      const dayEndUtc = new Date(dayEndJst.getTime() - 9 * 60 * 60 * 1000);
      
      allDates.push({
        dateKey,
        dayStartUtc,
        dayEndUtc,
      });
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    console.log(`対象日数: ${allDates.length}日`);
    console.log('データを集計中...');
    console.log('');

    // 各日のDAU、WAU、MAUを計算
    const dailyMetrics = [];

    for (let i = 0; i < allDates.length; i++) {
      const dateInfo = allDates[i];
      const dayStartUtc = dateInfo.dayStartUtc;
      const dayEndUtc = dateInfo.dayEndUtc;

      // DAU: その日にセッションを開始したユニークなユーザー数（除外ユーザーを除く）
      const dauUsers = await prisma.userSession.findMany({
        where: {
          startTime: {
            gte: dayStartUtc,
            lte: dayEndUtc,
          },
          userId: {
            notIn: EXCLUDED_USER_IDS,
          },
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      });
      const dau = dauUsers.length;

      // WAU: その日を含む過去7日間（その日から6日前まで）にセッションを開始したユニークなユーザー数（除外ユーザーを除く）
      const wauStartUtc = new Date(dayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000); // 6日前の00:00:00
      const wauUsers = await prisma.userSession.findMany({
        where: {
          startTime: {
            gte: wauStartUtc,
            lte: dayEndUtc,
          },
          userId: {
            notIn: EXCLUDED_USER_IDS,
          },
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      });
      const wau = wauUsers.length;

      // MAU: その日を含む過去30日間（その日から29日前まで）にセッションを開始したユニークなユーザー数（除外ユーザーを除く）
      const mauStartUtc = new Date(dayStartUtc.getTime() - 29 * 24 * 60 * 60 * 1000); // 29日前の00:00:00
      const mauUsers = await prisma.userSession.findMany({
        where: {
          startTime: {
            gte: mauStartUtc,
            lte: dayEndUtc,
          },
          userId: {
            notIn: EXCLUDED_USER_IDS,
          },
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      });
      const mau = mauUsers.length;

      dailyMetrics.push({
        date: dateInfo.dateKey,
        dau,
        wau,
        mau,
      });

      // 進捗表示
      if ((i + 1) % 10 === 0 || i === allDates.length - 1) {
        console.log(`処理中: ${i + 1}/${allDates.length} 日`);
      }
    }

    console.log('');
    console.log('データ集計完了');
    console.log('');

    // CSVファイルに出力
    const csvLines = ['日付(JST),DAU,WAU,MAU'];

    dailyMetrics.forEach((metric) => {
      csvLines.push([
        metric.date,
        metric.dau,
        metric.wau,
        metric.mau,
      ].join(','));
    });

    const csvContent = csvLines.join('\n');
    const csvPath = join(process.cwd(), 'scripts', 'dau-wau-mau.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'dau-wau-mau.csv');
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);
    console.log('');

    // サマリー統計
    const avgDAU = (dailyMetrics.reduce((sum, m) => sum + m.dau, 0) / dailyMetrics.length).toFixed(2);
    const avgWAU = (dailyMetrics.reduce((sum, m) => sum + m.wau, 0) / dailyMetrics.length).toFixed(2);
    const avgMAU = (dailyMetrics.reduce((sum, m) => sum + m.mau, 0) / dailyMetrics.length).toFixed(2);
    const maxDAU = Math.max(...dailyMetrics.map(m => m.dau));
    const maxWAU = Math.max(...dailyMetrics.map(m => m.wau));
    const maxMAU = Math.max(...dailyMetrics.map(m => m.mau));

    console.log('=== サマリー ===');
    console.log(`平均DAU: ${avgDAU}`);
    console.log(`平均WAU: ${avgWAU}`);
    console.log(`平均MAU: ${avgMAU}`);
    console.log(`最大DAU: ${maxDAU}`);
    console.log(`最大WAU: ${maxWAU}`);
    console.log(`最大MAU: ${maxMAU}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

calculateDAUWAUMAU();

