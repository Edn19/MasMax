ALTER TYPE "VideoType" ADD VALUE 'DRIVE';
ALTER TYPE "VideoSource" ADD VALUE 'DRIVE';
ALTER TYPE "VideoSource" ADD VALUE 'HLS';

ALTER TABLE "Episode"
ADD COLUMN "originalVideoUrl" TEXT,
ADD COLUMN "processedVideoUrl" TEXT;

UPDATE "Episode"
SET "originalVideoUrl" = "videoUrl",
    "processedVideoUrl" = "videoUrl"
WHERE "originalVideoUrl" IS NULL;
