// scripts/week1-message-days.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// JST日付をUTCに変換（JST = UTC+9）
function jstToUtc(jstYear, jstMonth, jstDay, hour = 0, minute = 0, second = 0, ms = 0) {
  const jstDate = new Date(Date.UTC(jstYear, jstMonth - 1, jstDay, hour, minute, second, ms));
  return new Date(jstDate.getTime() - 9 * 60 * 60 * 1000);
}

// UTCをJSTに変換
function utcToJst(utcDate) {
  return new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
}

async function main() {
  try {
    const EXCLUDED_USER_IDS = [
      "a3cb6700-2998-42ad-adc2-63cb847cc426",
      "6450a621-02bc-4282-a79f-4e2cbc6cd352",
      "100bbaea-98b5-427d-9903-86b9350932db",
      "d06b5736-b45f-49f9-8022-7d9a7f07fff7",
      "3e6c9b53-e16f-4cb0-b917-a6f5f4da8d1d",
      "dee5119c-057a-4004-bea8-bf2c8944b7d7",
      "17da8fcc-6289-494d-b0e6-cf9edc3a82f5",
      "58a08854-03be-466e-9594-c07a2fc18cf4",
      "37a83251-2515-4d60-88d9-6582bf8e7f17",
      "b0b57a0c-334d-40cf-9eb5-77064281f380",
      "8b1f95a9-858b-4e1c-ae64-2f939c3830e4",
      "e50c0557-dc92-4cc5-832a-07508ff65f68",
    ];

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const filteredUsers = users.filter((u) => !EXCLUDED_USER_IDS.includes(u.id));

    console.log(`ユーザー数: ${filteredUsers.length}（除外前: ${users.length}）`);

    const csvLines = [
      [
        "ユーザーID",
        "ユーザー名",
        "メールアドレス",
        "登録日時(JST)",
        "day1",
        "day2",
        "day3",
        "day4",
        "day5",
        "day6",
        "day7",
        "送信日数(7日間)",
      ].join(","),
    ];

    for (let idx = 0; idx < filteredUsers.length; idx++) {
      const user = filteredUsers[idx];
      if (idx % 10 === 0) {
        console.log(`処理中: ${idx + 1}/${filteredUsers.length} ユーザー`);
      }
      const createdJst = utcToJst(user.createdAt);
      const createdJstDateStr = createdJst.toISOString().replace("T", " ").substring(0, 19);

      // 1日目〜7日目の境界をUTCで計算し、並列でカウント
      const dayFlags = await Promise.all(
        Array.from({ length: 7 }, (_, d) => {
        const dayJst = new Date(
          Date.UTC(
            createdJst.getUTCFullYear(),
            createdJst.getUTCMonth(),
            createdJst.getUTCDate() + d,
            0,
            0,
            0,
            0
          )
        );
        const dayStartUtc = new Date(dayJst.getTime() - 9 * 60 * 60 * 1000);
        const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000 - 1);

          return prisma.sentMessage.count({
          where: {
            senderId: user.id,
            createdAt: { gte: dayStartUtc, lte: dayEndUtc },
            isHidden: false,
          },
          }).then((count) => (count > 0 ? 1 : 0));
        })
      );

      const sentDays = dayFlags.reduce((sum, v) => sum + v, 0);

      csvLines.push(
        [
          user.id,
          `"${user.name}"`,
          user.email,
          createdJstDateStr,
          ...dayFlags,
          sentDays,
        ].join(",")
      );
    }

    const csvContent = csvLines.join("\n");
    const outPath = join(process.cwd(), "scripts", "week1-message-days.csv");
    writeFileSync(outPath, csvContent, "utf-8");
    const downloadPath = join(process.env.HOME || "~", "Downloads", "week1-message-days.csv");
    writeFileSync(downloadPath, csvContent, "utf-8");

    console.log(`✅ CSVを出力しました: ${outPath}`);
    console.log(`✅ ダウンロードにも保存しました: ${downloadPath}`);
  } catch (error) {
    console.error("エラーが発生しました", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
