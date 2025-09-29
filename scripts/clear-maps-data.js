import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearMapsData() {
  try {
    console.log("Clearing Google Maps related data...");

    // Google Mapsのリンクを含むPresetMessageを削除
    const deletedPresetMessages = await prisma.presetMessage.deleteMany({
      where: {
        OR: [
          { content: { contains: "maps.google.com" } },
          { content: { contains: "maps.app.goo.gl" } },
          { content: { contains: "goo.gl" } },
        ],
      },
    });

    console.log(`Deleted ${deletedPresetMessages.count} preset messages`);

    // Google Mapsのリンクを含むSentMessageを削除
    const deletedSentMessages = await prisma.sentMessage.deleteMany({
      where: {
        OR: [
          { message: { contains: "maps.google.com" } },
          { message: { contains: "maps.app.goo.gl" } },
          { message: { contains: "goo.gl" } },
        ],
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

clearMapsData();
