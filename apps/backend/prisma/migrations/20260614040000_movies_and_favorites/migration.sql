CREATE TYPE "MovieStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');

CREATE TABLE "Movie" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "posterUrl" TEXT NOT NULL,
  "bannerUrl" TEXT NOT NULL,
  "videoSource" "VideoSource" NOT NULL DEFAULT 'URL',
  "videoType" "VideoType" NOT NULL DEFAULT 'MP4',
  "videoUrl" TEXT NOT NULL,
  "originalVideoUrl" TEXT,
  "processedVideoUrl" TEXT,
  "duration" INTEGER NOT NULL,
  "releaseYear" INTEGER NOT NULL,
  "status" "MovieStatus" NOT NULL DEFAULT 'DRAFT',
  "views" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Favorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "episodeId" TEXT,
  "movieId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Favorite_target_check" CHECK (
    ("episodeId" IS NOT NULL AND "movieId" IS NULL)
    OR ("episodeId" IS NULL AND "movieId" IS NOT NULL)
  )
);

CREATE TABLE "_MovieGenres" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "Movie_slug_key" ON "Movie"("slug");
CREATE UNIQUE INDEX "Favorite_userId_episodeId_key" ON "Favorite"("userId", "episodeId");
CREATE UNIQUE INDEX "Favorite_userId_movieId_key" ON "Favorite"("userId", "movieId");
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");
CREATE UNIQUE INDEX "_MovieGenres_AB_unique" ON "_MovieGenres"("A", "B");
CREATE INDEX "_MovieGenres_B_index" ON "_MovieGenres"("B");

ALTER TABLE "Favorite"
ADD CONSTRAINT "Favorite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite"
ADD CONSTRAINT "Favorite_episodeId_fkey"
FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite"
ADD CONSTRAINT "Favorite_movieId_fkey"
FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_MovieGenres"
ADD CONSTRAINT "_MovieGenres_A_fkey"
FOREIGN KEY ("A") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_MovieGenres"
ADD CONSTRAINT "_MovieGenres_B_fkey"
FOREIGN KEY ("B") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
