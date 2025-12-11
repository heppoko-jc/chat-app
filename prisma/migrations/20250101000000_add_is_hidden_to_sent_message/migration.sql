-- AlterTable
ALTER TABLE "SentMessage"
ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SentMessage_isHidden_idx" ON "SentMessage"("isHidden");
