-- AlterTable
ALTER TABLE "SentMessage" ADD COLUMN IF NOT EXISTS "shortcutId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SentMessage_shortcutId_idx" ON "SentMessage"("shortcutId");

-- AddForeignKey
ALTER TABLE "SentMessage" ADD CONSTRAINT "SentMessage_shortcutId_fkey" FOREIGN KEY ("shortcutId") REFERENCES "Shortcut"("id") ON DELETE SET NULL ON UPDATE CASCADE;

