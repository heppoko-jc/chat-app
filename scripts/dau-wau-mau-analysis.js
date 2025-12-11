// scripts/dau-wau-mau-analysis.js

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

async function analyzeDAUWAUMAU() {
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

      // DAU: その日にセッション開始したユニークなユーザー数
      const dauUsers = await prisma.userSession.findMany({
        where: {
          startTime: {
            gte: dayStartUtc,
            lte: dayEndUtc,
          },
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      });
      const dau = dauUsers.length;

      // WAU: その日を含む過去7日間（その日から6日前まで）にセッション開始したユニークなユーザー数
      const wauStartUtc = new Date(dayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000); // 6日前の00:00:00
      const wauUsers = await prisma.userSession.findMany({
        where: {
          startTime: {
            gte: wauStartUtc,
            lte: dayEndUtc,
          },
        },
        select: {
          userId: true,
        },
        distinct: ['userId'],
      });
      const wau = wauUsers.length;

      // MAU: その日を含む過去30日間（その日から29日前まで）にセッション開始したユニークなユーザー数
      const mauStartUtc = new Date(dayStartUtc.getTime() - 29 * 24 * 60 * 60 * 1000); // 29日前の00:00:00
      const mauUsers = await prisma.userSession.findMany({
        where: {
          startTime: {
            gte: mauStartUtc,
            lte: dayEndUtc,
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
    const csvPath = join(process.cwd(), 'scripts', 'dau-wau-mau-analysis.csv');
    writeFileSync(csvPath, csvContent, 'utf-8');
    
    // ダウンロードフォルダにもコピー
    const downloadPath = join(process.env.HOME || '~', 'Downloads', 'dau-wau-mau-analysis.csv');
    writeFileSync(downloadPath, csvContent, 'utf-8');
    
    console.log(`✅ CSVファイルを出力しました: ${csvPath}`);
    console.log(`✅ ダウンロードフォルダにもコピーしました: ${downloadPath}`);
    console.log('');

    // サマリー統計
    const dauValues = dailyMetrics.map(m => m.dau);
    const wauValues = dailyMetrics.map(m => m.wau);
    const mauValues = dailyMetrics.map(m => m.mau);

    const avgDAU = (dauValues.reduce((a, b) => a + b, 0) / dauValues.length).toFixed(2);
    const avgWAU = (wauValues.reduce((a, b) => a + b, 0) / wauValues.length).toFixed(2);
    const avgMAU = (mauValues.reduce((a, b) => a + b, 0) / mauValues.length).toFixed(2);

    const maxDAU = Math.max(...dauValues);
    const maxWAU = Math.max(...wauValues);
    const maxMAU = Math.max(...mauValues);

    const minDAU = Math.min(...dauValues);
    const minWAU = Math.min(...wauValues);
    const minMAU = Math.min(...mauValues);

    console.log('=== サマリー統計 ===');
    console.log(`平均DAU: ${avgDAU}`);
    console.log(`平均WAU: ${avgWAU}`);
    console.log(`平均MAU: ${avgMAU}`);
    console.log('');
    console.log(`最大DAU: ${maxDAU}`);
    console.log(`最大WAU: ${maxWAU}`);
    console.log(`最大MAU: ${maxMAU}`);
    console.log('');
    console.log(`最小DAU: ${minDAU}`);
    console.log(`最小WAU: ${minWAU}`);
    console.log(`最小MAU: ${minMAU}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDAUWAUMAU();

