-- CreateTable
CREATE TABLE IF NOT EXISTS "UserSession" (
  "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     TEXT NOT NULL,
  "startTime"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS "UserSession_userId_startTime_idx"
  ON "UserSession" ("userId", "startTime");


