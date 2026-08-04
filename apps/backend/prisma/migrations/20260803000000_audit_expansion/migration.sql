ALTER TABLE "AuditLog"
ADD COLUMN "before" JSONB,
ADD COLUMN "after" JSONB,
ADD COLUMN "metadata" JSONB;

CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
