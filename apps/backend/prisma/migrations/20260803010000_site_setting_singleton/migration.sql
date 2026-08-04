ALTER TABLE "SiteSetting" ADD COLUMN "key" TEXT;

WITH canonical AS (
  SELECT "id" FROM "SiteSetting" ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC LIMIT 1
), duplicates AS (
  SELECT setting."id", canonical."id" AS "canonicalId"
  FROM "SiteSetting" setting CROSS JOIN canonical
  WHERE setting."id" <> canonical."id"
)
INSERT INTO "AuditLog" ("id", "action", "entity", "entityId", "metadata", "createdAt")
SELECT 'site-setting-merge-' || md5("id" || clock_timestamp()::text), 'SITE_SETTING_DUPLICATE_MERGED', 'SiteSetting', "canonicalId", jsonb_build_object('duplicateId', "id", 'canonicalId', "canonicalId"), CURRENT_TIMESTAMP
FROM duplicates;

WITH canonical AS (
  SELECT "id" FROM "SiteSetting" ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC LIMIT 1
)
DELETE FROM "SiteSetting" WHERE "id" NOT IN (SELECT "id" FROM canonical);

UPDATE "SiteSetting" SET "key" = 'default';
ALTER TABLE "SiteSetting" ALTER COLUMN "key" SET DEFAULT 'default';
ALTER TABLE "SiteSetting" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "SiteSetting_key_key" ON "SiteSetting"("key");
