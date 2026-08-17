CREATE TYPE "VideoProcessingKind" AS ENUM ('HLS', 'REMUX');

ALTER TYPE "EpisodePlaybackMode" ADD VALUE 'REMUX' AFTER 'ORIGINAL';

ALTER TABLE "Episode"
ADD COLUMN "remuxedVideoUrl" TEXT;

ALTER TABLE "VideoProcessingJob"
ADD COLUMN "kind" "VideoProcessingKind" NOT NULL DEFAULT 'HLS';

CREATE INDEX "VideoProcessingJob_inputMediaFileId_kind_status_idx"
ON "VideoProcessingJob"("inputMediaFileId", "kind", "status");
