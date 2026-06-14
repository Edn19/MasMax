ALTER TYPE "VideoType" ADD VALUE 'EMBED';

CREATE TYPE "VideoSource" AS ENUM ('LOCAL', 'URL', 'EMBED');

ALTER TABLE "User"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Episode"
RENAME COLUMN "thumbnail" TO "thumbnailUrl";

ALTER TABLE "Episode"
ALTER COLUMN "thumbnailUrl" DROP NOT NULL,
ADD COLUMN "videoSource" "VideoSource" NOT NULL DEFAULT 'URL';

ALTER TABLE "SiteSetting"
ADD COLUMN "favicon" TEXT,
ADD COLUMN "secondaryColor" TEXT NOT NULL DEFAULT '#fb7185',
ADD COLUMN "colorMode" TEXT NOT NULL DEFAULT 'dark',
ADD COLUMN "heroTitle" TEXT NOT NULL DEFAULT 'Historias originales para descubrir',
ADD COLUMN "heroText" TEXT NOT NULL DEFAULT 'Explora series ficticias, episodios demo y contenido original.',
ADD COLUMN "heroImage" TEXT,
ADD COLUMN "featuredSeriesIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "sectionOrder" JSONB NOT NULL DEFAULT '["featured","latest","popular","genres","catalog"]',
ADD COLUMN "showLatestEpisodes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "showPopularSeries" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "showGenres" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "showComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "showFooter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "footerText" TEXT NOT NULL DEFAULT 'Contenido ficticio para catalogo privado.';
