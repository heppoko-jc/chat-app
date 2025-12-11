-- AlterTable: add columns (1文ずつ)
ALTER TABLE "SentMessage" ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT;
ALTER TABLE "SentMessage" ADD COLUMN IF NOT EXISTS "replyText" TEXT;

-- AddForeignKey (存在チェックしてから追加)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SentMessage_replyToMessageId_fkey'
  ) THEN
    ALTER TABLE "SentMessage"
      ADD CONSTRAINT "SentMessage_replyToMessageId_fkey"
      FOREIGN KEY ("replyToMessageId") REFERENCES "SentMessage"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SentMessage_replyToMessageId_idx" ON "SentMessage"("replyToMessageId");
