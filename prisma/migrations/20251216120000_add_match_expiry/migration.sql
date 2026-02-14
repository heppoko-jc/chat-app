-- AlterTable: User.lastMatchExpiryDays (1=1日, 7=1週間, 14=2週間。送信時に選んだ最後の値)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastMatchExpiryDays" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: SentMessage.expiresAt (nullable first for backfill)
ALTER TABLE "SentMessage" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Backfill: 既存レコードは「1日有効」として expiresAt = createdAt + 1日
UPDATE "SentMessage" SET "expiresAt" = "createdAt" + interval '1 day' WHERE "expiresAt" IS NULL;

-- Make expiresAt required
ALTER TABLE "SentMessage" ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateIndex: 有効期限フィルタ用
CREATE INDEX IF NOT EXISTS "SentMessage_expiresAt_idx" ON "SentMessage"("expiresAt");
