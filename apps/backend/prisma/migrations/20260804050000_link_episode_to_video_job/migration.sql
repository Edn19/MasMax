-- Episodes may be created as drafts while their persistent processing job runs.
ALTER TABLE "Episode" ALTER COLUMN "videoUrl" DROP NOT NULL;
