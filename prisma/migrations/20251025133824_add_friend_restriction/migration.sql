-- CreateTable
CREATE TABLE "public"."FriendRestriction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastChange" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendRestriction_userId_key" ON "public"."FriendRestriction"("userId");

-- AddForeignKey
ALTER TABLE "public"."FriendRestriction" ADD CONSTRAINT "FriendRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
