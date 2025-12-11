// scripts/first-post-receivers.js

import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function analyzeFirstPostReceivers() {
  try {
    console.log('初回投稿時の送信先数を集計中...');
    console.log('');

    // より効率的な方法：メッセージ内容ごとに、最初の投稿時刻を取得
    // まず、各メッセージ内容の最初の投稿時刻を取得
    const firstPosts = await prisma.sentMessage.groupBy({
      by: ['message'],
      _min: {
        createdAt: true,
      },
      orderBy: {
        _min: {
          createdAt: 'asc',
        },
      },
    });

    console.log(`ユニークなメッセージ内容数: ${firstPosts.length}種類`);
    console.log('処理中...');

    let totalReceivers = 0;
    const messageStats = [];

    // 各メッセージ内容について、初回投稿時の送信先数を取得
    for (let i = 0; i < firstPosts.length; i++) {
      const firstPost = firstPosts[i];
      const message = firstPost.message;
      const firstCreatedAt = firstPost._min.createdAt;

      // そのメッセージ内容で、最初の投稿時刻に送信されたメッセージを取得
      // 同じ時刻（ミリ秒単位）で送信されたものを取得
      const firstPostMessages = await prisma.sentMessage.findMany({
        where: {
          message: message,
          createdAt: firstCreatedAt,
        },
        select: {
          senderId: true,
          receiverId: true,
        },
      });

      // 最初の送信者を特定（最初のレコードの送信者）
      if (firstPostMessages.length > 0) {
        const firstSenderId = firstPostMessages[0].senderId;
        
        // 初回投稿時から5分以内（300秒 = 300000ミリ秒）に送信されたメッセージを取得
        const fiveMinutesLater = new Date(firstCreatedAt.getTime() + 5 * 60 * 1000);
        
        const messagesWithin5Min = await prisma.sentMessage.findMany({
          where: {
            message: message,
            senderId: firstSenderId,
            createdAt: {
              gte: firstCreatedAt,
              lte: fiveMinutesLater,
            },
          },
          select: {
            receiverId: true,
          },
        });

        // 5分以内に送った相手の数をカウント（ユニーク）
        const receivers = new Set();
        messagesWithin5Min.forEach((msg) => {
          receivers.add(msg.receiverId);
        });

        const receiverCount = receivers.size;
        totalReceivers += receiverCount;
        messageStats.push({
          message,
          senderId: firstSenderId,
          firstCreatedAt,
          receiverCount,
        });
      }

      // 進捗表示
      if ((i + 1) % 100 === 0 || i === firstPosts.length - 1) {
        console.log(`処理中: ${i + 1}/${firstPosts.length} メッセージ`);
      }
    }

    // 送信先数の多い順にソート（上位20件）
    messageStats.sort((a, b) => b.receiverCount - a.receiverCount);

    console.log('=== 結果 ===');
    console.log(`初回投稿時から5分以内の送信先数の合計: ${totalReceivers}人`);
    console.log('');

    // 送信先数の多いメッセージ（上位20件）
    console.log('=== 初回投稿時から5分以内の送信先数が多いメッセージ（上位20件） ===');
    messageStats.slice(0, 20).forEach((stat, index) => {
      const truncatedMessage = stat.message.length > 50 
        ? stat.message.substring(0, 50) + '...' 
        : stat.message;
      const dateStr = stat.firstCreatedAt.toISOString().replace('T', ' ').substring(0, 19);
      console.log(`${index + 1}. [${dateStr}] ${truncatedMessage}: ${stat.receiverCount}人`);
    });

    // 統計情報
    const avgReceivers = (totalReceivers / firstPosts.length).toFixed(2);
    const maxReceivers = messageStats[0]?.receiverCount || 0;
    const minReceivers = messageStats[messageStats.length - 1]?.receiverCount || 0;

    console.log('');
    console.log('=== 統計 ===');
    console.log(`メッセージ種類数: ${firstPosts.length}種類`);
    console.log(`初回投稿時から5分以内の送信先数の合計: ${totalReceivers}人`);
    console.log(`1メッセージあたりの平均送信先数: ${avgReceivers}人`);
    console.log(`最大送信先数: ${maxReceivers}人`);
    console.log(`最小送信先数: ${minReceivers}人`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeFirstPostReceivers();

