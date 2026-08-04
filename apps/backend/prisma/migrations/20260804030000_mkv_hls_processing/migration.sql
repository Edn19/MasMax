CREATE TYPE "VideoProcessingTargetType" AS ENUM ('MOVIE', 'EPISODE');

ALTER TABLE "MediaFile" ADD COLUMN "probeMetadata" JSONB;

ALTER TABLE "VideoProcessingJob"
ADD COLUMN "processingStage" TEXT NOT NULL DEFAULT 'QUEUED',
ADD COLUMN "sourceFormat" TEXT,
ADD COLUMN "sourceVideoCodec" TEXT,
ADD COLUMN "sourceAudioCodecs" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "sourceMetadata" JSONB,
ADD COLUMN "generatedQualities" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "audioTracks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "subtitleTracks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "targetType" "VideoProcessingTargetType",
ADD COLUMN "targetId" TEXT,
ADD COLUMN "associatedAt" TIMESTAMP(3);

CREATE INDEX "VideoProcessingJob_targetType_targetId_idx" ON "VideoProcessingJob"("targetType", "targetId");
