CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "SeriesStatus" AS ENUM ('AIRING', 'FINISHED', 'PAUSED');
CREATE TYPE "VideoType" AS ENUM ('MP4', 'HLS');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Series" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "cover" TEXT NOT NULL,
  "banner" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "status" "SeriesStatus" NOT NULL DEFAULT 'AIRING',
  "views" INTEGER NOT NULL DEFAULT 0,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Episode" (
  "id" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "videoType" "VideoType" NOT NULL,
  "thumbnail" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "views" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Genre" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "approved" BOOLEAN NOT NULL DEFAULT true,
  "userId" TEXT NOT NULL,
  "episodeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteSetting" (
  "id" TEXT NOT NULL,
  "siteName" TEXT NOT NULL DEFAULT 'NovaStream',
  "logo" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#22d3ee',
  "facebook" TEXT,
  "instagram" TEXT,
  "youtube" TEXT,
  "tiktok" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ViewLog" (
  "id" TEXT NOT NULL,
  "ip" TEXT,
  "seriesId" TEXT,
  "episodeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ViewLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_SeriesGenres" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");
CREATE UNIQUE INDEX "Episode_seriesId_number_key" ON "Episode"("seriesId", "number");
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");
CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");
CREATE UNIQUE INDEX "_SeriesGenres_AB_unique" ON "_SeriesGenres"("A", "B");
CREATE INDEX "_SeriesGenres_B_index" ON "_SeriesGenres"("B");

ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ViewLog" ADD CONSTRAINT "ViewLog_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ViewLog" ADD CONSTRAINT "ViewLog_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "_SeriesGenres" ADD CONSTRAINT "_SeriesGenres_A_fkey" FOREIGN KEY ("A") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_SeriesGenres" ADD CONSTRAINT "_SeriesGenres_B_fkey" FOREIGN KEY ("B") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
