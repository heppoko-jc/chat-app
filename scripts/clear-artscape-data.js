import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearArtscapeData() {
  try {
    console.log("Clearing artscape.jp related data...");

    // artscape.jpのリンクを含むPresetMessageを削除
    const deletedPresetMessages = await prisma.presetMessage.deleteMany({
      where: {
        content: { contains: "artscape.jp" },
      },
    });

    console.log(`Deleted ${deletedPresetMessages.count} preset messages`);

    // artscape.jpのリンクを含むSentMessageを削除
    const deletedSentMessages = await prisma.sentMessage.deleteMany({
      where: {
        message: { contains: "artscape.jp" },
      },
    });

    console.log(`Deleted ${deletedSentMessages.count} sent messages`);

    console.log("Data cleared successfully!");
  } catch (error) {
    console.error("Error clearing data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

clearArtscapeData();
