-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consentDataUsage" BOOLEAN,
ADD COLUMN     "consentDate" TIMESTAMP(3),
ADD COLUMN     "consentInterview" BOOLEAN,
ADD COLUMN     "consentParticipated" BOOLEAN,
ADD COLUMN     "consentRecording" BOOLEAN,
ADD COLUMN     "participantName" TEXT;
