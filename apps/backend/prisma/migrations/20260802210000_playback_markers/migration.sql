ALTER TABLE "Episode"
  ADD COLUMN "introStartSec" INTEGER,
  ADD COLUMN "introEndSec" INTEGER,
  ADD COLUMN "recapStartSec" INTEGER,
  ADD COLUMN "recapEndSec" INTEGER;

ALTER TABLE "Movie"
  ADD COLUMN "introStartSec" INTEGER,
  ADD COLUMN "introEndSec" INTEGER,
  ADD COLUMN "recapStartSec" INTEGER,
  ADD COLUMN "recapEndSec" INTEGER;
