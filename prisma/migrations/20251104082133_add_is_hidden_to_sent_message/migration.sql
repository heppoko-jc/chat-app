-- AlterTable
ALTER TABLE "public"."SentMessage" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SentMessage_isHidden_idx" ON "public"."SentMessage"("isHidden");

