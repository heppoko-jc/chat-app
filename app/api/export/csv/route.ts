// app/api/export/csv/route.ts

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// CSVエスケープ関数
function escapeCsv(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// 配列をCSVに変換
function arrayToCsv(data: any[], headers: string[]): string {
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((header) => escapeCsv(row[header])).join(",")
    ),
  ];
  return csvRows.join("\n");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table") || "all";

  try {
    let csvContent = "";
    let filename = "";

    switch (table) {
      case "users":
        const users = await prisma.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            bio: true,
            createdAt: true,
          },
        });
        csvContent = arrayToCsv(users, [
          "id",
          "name",
          "email",
          "bio",
          "createdAt",
        ]);
        filename = "users.csv";
        break;

      case "presetMessages":
        const presetMessages = await prisma.presetMessage.findMany();
        csvContent = arrayToCsv(presetMessages, [
          "id",
          "content",
          "createdBy",
          "createdAt",
          "count",
          "senderCount",
          "linkImage",
          "linkTitle",
          "comment",
          "type",
          "lastSentAt",
        ]);
        filename = "preset-messages.csv";
        break;

      case "sentMessages":
        const sentMessages = await prisma.sentMessage.findMany({
          include: {
            sender: { select: { name: true } },
            receiver: { select: { name: true } },
          },
        });
        const sentMessagesWithNames = sentMessages.map((msg) => ({
          ...msg,
          senderName: msg.sender.name,
          receiverName: msg.receiver.name,
        }));
        csvContent = arrayToCsv(sentMessagesWithNames, [
          "id",
          "senderId",
          "senderName",
          "receiverId",
          "receiverName",
          "message",
          "createdAt",
          "linkImage",
          "linkTitle",
        ]);
        filename = "sent-messages.csv";
        break;

      case "matchPairs":
        const matchPairs = await prisma.matchPair.findMany({
          include: {
            user1: { select: { name: true } },
            user2: { select: { name: true } },
          },
        });
        const matchPairsWithNames = matchPairs.map((match) => ({
          ...match,
          user1Name: match.user1.name,
          user2Name: match.user2.name,
        }));
        csvContent = arrayToCsv(matchPairsWithNames, [
          "id",
          "user1Id",
          "user1Name",
          "user2Id",
          "user2Name",
          "message",
          "matchedAt",
        ]);
        filename = "match-pairs.csv";
        break;

      case "all":
      default:
        // 全てのテーブルを1つのCSVにまとめる
        const [usersAll, presetAll, sentAll, matchAll] = await Promise.all([
          prisma.user.findMany({
            select: {
              id: true,
              name: true,
              email: true,
              bio: true,
              createdAt: true,
            },
          }),
          prisma.presetMessage.findMany(),
          prisma.sentMessage.findMany({
            include: {
              sender: { select: { name: true } },
              receiver: { select: { name: true } },
            },
          }),
          prisma.matchPair.findMany({
            include: {
              user1: { select: { name: true } },
              user2: { select: { name: true } },
            },
          }),
        ]);

        const allData = [
          // サマリー
          {
            type: "SUMMARY",
            table: "USERS",
            count: usersAll.length,
            note: "Total users in database",
          },
          {
            type: "SUMMARY",
            table: "PRESET_MESSAGES",
            count: presetAll.length,
            note: "Total preset messages",
          },
          {
            type: "SUMMARY",
            table: "SENT_MESSAGES",
            count: sentAll.length,
            note: "Total sent messages",
          },
          {
            type: "SUMMARY",
            table: "MATCH_PAIRS",
            count: matchAll.length,
            note: "Total matches",
          },

          // ユーザー
          ...usersAll.map((u) => ({ type: "USER", ...u })),

          // プリセットメッセージ
          ...presetAll.map((p) => ({ type: "PRESET_MESSAGE", ...p })),

          // 送信メッセージ
          ...sentAll.map((s) => ({
            type: "SENT_MESSAGE",
            ...s,
            senderName: s.sender.name,
            receiverName: s.receiver.name,
          })),

          // マッチペア
          ...matchAll.map((m) => ({
            type: "MATCH_PAIR",
            ...m,
            user1Name: m.user1.name,
            user2Name: m.user2.name,
          })),
        ];

        csvContent = arrayToCsv(allData, [
          "type",
          "id",
          "name",
          "email",
          "bio",
          "content",
          "createdBy",
          "senderId",
          "receiverId",
          "user1Id",
          "user2Id",
          "message",
          "createdAt",
          "count",
          "senderCount",
          "matchedAt",
          "linkImage",
          "linkTitle",
          "comment",
          "type",
          "senderName",
          "receiverName",
          "user1Name",
          "user2Name",
          "table",
          "note",
        ]);
        filename = "database-all.csv";
        break;
    }

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("CSVエクスポートエラー:", error);
    return NextResponse.json(
      { error: "CSVエクスポートに失敗しました" },
      { status: 500 }
    );
  }
}
