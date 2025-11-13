-- CreateTable
CREATE TABLE IF NOT EXISTS "Shortcut" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shortcut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShortcutMember" (
    "id" TEXT NOT NULL,
    "shortcutId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ShortcutMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Shortcut_userId_idx" ON "Shortcut"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShortcutMember_shortcutId_idx" ON "ShortcutMember"("shortcutId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShortcutMember_memberId_idx" ON "ShortcutMember"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ShortcutMember_shortcutId_memberId_key" ON "ShortcutMember"("shortcutId", "memberId");

-- AddForeignKey
ALTER TABLE "Shortcut" ADD CONSTRAINT "Shortcut_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortcutMember" ADD CONSTRAINT "ShortcutMember_shortcutId_fkey" FOREIGN KEY ("shortcutId") REFERENCES "Shortcut"("id") ON DELETE CASCADE ON UPDATE CASCADE;

