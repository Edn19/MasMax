CREATE TABLE "Season" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "posterUrl" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Season" ("id", "seriesId", "number", "title", "published", "createdAt", "updatedAt")
SELECT 'season_' || md5("id"), "id", 1, 'Temporada 1', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Series";

ALTER TABLE "Episode"
  ADD COLUMN "seasonId" TEXT,
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "durationSec" INTEGER,
  ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Episode" AS episode
SET "seasonId" = season."id", "position" = episode."number"
FROM "Season" AS season
WHERE season."seriesId" = episode."seriesId" AND season."number" = 1;

ALTER TABLE "Episode" ALTER COLUMN "seasonId" SET NOT NULL;

DROP INDEX "Episode_seriesId_number_key";

CREATE UNIQUE INDEX "Season_seriesId_number_key" ON "Season"("seriesId", "number");
CREATE INDEX "Season_seriesId_published_deletedAt_idx" ON "Season"("seriesId", "published", "deletedAt");
CREATE UNIQUE INDEX "Episode_seasonId_number_key" ON "Episode"("seasonId", "number");
CREATE INDEX "Episode_seasonId_position_deletedAt_idx" ON "Episode"("seasonId", "position", "deletedAt");
CREATE INDEX "Episode_seriesId_published_deletedAt_idx" ON "Episode"("seriesId", "published", "deletedAt");

ALTER TABLE "Season" ADD CONSTRAINT "Season_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
