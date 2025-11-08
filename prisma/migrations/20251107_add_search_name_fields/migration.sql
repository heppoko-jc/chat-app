-- AlterTable
ALTER TABLE "User"
ADD COLUMN "nameEn" TEXT,
ADD COLUMN "nameJa" TEXT,
ADD COLUMN "nameOther" TEXT;

-- CreateIndex
CREATE INDEX "User_nameEn_idx" ON "User"("nameEn");

-- CreateIndex
CREATE INDEX "User_nameJa_idx" ON "User"("nameJa");

-- CreateIndex
CREATE INDEX "User_nameOther_idx" ON "User"("nameOther");
