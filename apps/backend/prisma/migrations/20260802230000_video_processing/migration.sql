CREATE TYPE "VideoProcessingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
ALTER TYPE "MediaStatus" ADD VALUE 'DELETED';

CREATE TABLE "VideoProcessingJob" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "inputMediaFileId" TEXT NOT NULL,
    "outputMediaFileId" TEXT,
    "queueJobId" TEXT,
    "status" "VideoProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "sourceWidth" INTEGER,
    "sourceHeight" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "profiles" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "masterPath" TEXT,
    "thumbnailPath" TEXT,
    "retainOriginal" BOOLEAN NOT NULL DEFAULT true,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoProcessingJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoProcessingJob_outputMediaFileId_key" ON "VideoProcessingJob"("outputMediaFileId");
CREATE UNIQUE INDEX "VideoProcessingJob_queueJobId_key" ON "VideoProcessingJob"("queueJobId");
CREATE INDEX "VideoProcessingJob_status_createdAt_idx" ON "VideoProcessingJob"("status", "createdAt");
CREATE INDEX "VideoProcessingJob_requestedById_createdAt_idx" ON "VideoProcessingJob"("requestedById", "createdAt");
CREATE INDEX "VideoProcessingJob_inputMediaFileId_createdAt_idx" ON "VideoProcessingJob"("inputMediaFileId", "createdAt");
ALTER TABLE "VideoProcessingJob" ADD CONSTRAINT "VideoProcessingJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoProcessingJob" ADD CONSTRAINT "VideoProcessingJob_inputMediaFileId_fkey" FOREIGN KEY ("inputMediaFileId") REFERENCES "MediaFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VideoProcessingJob" ADD CONSTRAINT "VideoProcessingJob_outputMediaFileId_fkey" FOREIGN KEY ("outputMediaFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
