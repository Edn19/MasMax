CREATE TYPE "EpisodePlaybackMode" AS ENUM ('ORIGINAL', 'HLS');

ALTER TABLE "Episode"
ADD COLUMN "playbackMode" "EpisodePlaybackMode" NOT NULL DEFAULT 'ORIGINAL';

UPDATE "Episode"
SET "playbackMode" = 'HLS'
WHERE "videoType" = 'HLS'
   OR "videoSource" = 'HLS'
   OR "videoUrl" LIKE '%.m3u8%'
   OR "processedVideoUrl" LIKE '%.m3u8%';
