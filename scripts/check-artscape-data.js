import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkArtscapeData() {
  try {
    console.log("Checking artscape.jp related data...");

    // artscape.jpのリンクを含むPresetMessageを取得
    const presetMessages = await prisma.presetMessage.findMany({
      where: {
        content: { contains: "artscape.jp" },
      },
      select: {
        id: true,
        content: true,
        linkTitle: true,
        linkImage: true,
        createdAt: true,
      },
    });

    console.log("PresetMessages with artscape.jp:");
    presetMessages.forEach((msg, index) => {
      console.log(`${index + 1}. Content: ${msg.content}`);
      console.log(`   LinkTitle: ${msg.linkTitle}`);
      console.log(`   LinkImage: ${msg.linkImage}`);
      console.log(`   CreatedAt: ${msg.createdAt}`);
      console.log("---");
    });

    // artscape.jpのリンクを含むSentMessageを取得
    const sentMessages = await prisma.sentMessage.findMany({
      where: {
        message: { contains: "artscape.jp" },
      },
      select: {
        id: true,
        message: true,
        linkTitle: true,
        linkImage: true,
        createdAt: true,
      },
    });

    console.log("SentMessages with artscape.jp:");
    sentMessages.forEach((msg, index) => {
      console.log(`${index + 1}. Message: ${msg.message}`);
      console.log(`   LinkTitle: ${msg.linkTitle}`);
      console.log(`   LinkImage: ${msg.linkImage}`);
      console.log(`   CreatedAt: ${msg.createdAt}`);
      console.log("---");
    });
  } catch (error) {
    console.error("Error checking data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkArtscapeData();
