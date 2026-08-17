-- Keep the existing URL-based video fields for backwards compatibility while
-- adding a durable link to the stored original media file.
ALTER TABLE "Episode" ADD COLUMN "mediaFileId" TEXT;

CREATE INDEX "Episode_mediaFileId_idx" ON "Episode"("mediaFileId");

ALTER TABLE "Episode"
ADD CONSTRAINT "Episode_mediaFileId_fkey"
FOREIGN KEY ("mediaFileId") REFERENCES "MediaFile"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Recover links for existing local uploads when their public URL follows either
-- supported storage route. Unmatched legacy URLs remain fully functional.
UPDATE "Episode" AS episode
SET "mediaFileId" = media.id
FROM "MediaFile" AS media
WHERE media."mediaType" = 'VIDEO'
  AND media."extension" IN ('.mp4', '.mkv')
  AND (
    episode."originalVideoUrl" = '/uploads/' || media."relativePath"
    OR episode."originalVideoUrl" = '/api/storage/objects/' || media."relativePath"
    OR episode."videoUrl" = '/uploads/' || media."relativePath"
    OR episode."videoUrl" = '/api/storage/objects/' || media."relativePath"
  );
