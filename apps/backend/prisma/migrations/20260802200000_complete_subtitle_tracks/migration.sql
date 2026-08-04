CREATE TYPE "SubtitleFormat" AS ENUM ('VTT', 'SRT');

ALTER TABLE "SubtitleTrack"
  ADD COLUMN "originalName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "sourceFormat" "SubtitleFormat" NOT NULL DEFAULT 'VTT',
  ADD COLUMN "isForced" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

WITH ranked_episode_defaults AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "episodeId" ORDER BY "createdAt", "id") AS rank
  FROM "SubtitleTrack"
  WHERE "episodeId" IS NOT NULL AND "isDefault" = true
)
UPDATE "SubtitleTrack" AS track SET "isDefault" = false
FROM ranked_episode_defaults AS ranked
WHERE track."id" = ranked."id" AND ranked.rank > 1;

WITH ranked_movie_defaults AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "movieId" ORDER BY "createdAt", "id") AS rank
  FROM "SubtitleTrack"
  WHERE "movieId" IS NOT NULL AND "isDefault" = true
)
UPDATE "SubtitleTrack" AS track SET "isDefault" = false
FROM ranked_movie_defaults AS ranked
WHERE track."id" = ranked."id" AND ranked.rank > 1;

CREATE INDEX "SubtitleTrack_episodeId_isActive_idx" ON "SubtitleTrack"("episodeId", "isActive");
CREATE INDEX "SubtitleTrack_movieId_isActive_idx" ON "SubtitleTrack"("movieId", "isActive");
CREATE UNIQUE INDEX "SubtitleTrack_episode_default_key" ON "SubtitleTrack"("episodeId") WHERE "episodeId" IS NOT NULL AND "isDefault" = true;
CREATE UNIQUE INDEX "SubtitleTrack_movie_default_key" ON "SubtitleTrack"("movieId") WHERE "movieId" IS NOT NULL AND "isDefault" = true;
