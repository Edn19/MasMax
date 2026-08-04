CREATE INDEX "ViewLog_createdAt_idx" ON "ViewLog"("createdAt");
CREATE INDEX "Session_lastUsedAt_idx" ON "Session"("lastUsedAt");
CREATE INDEX "MediaFile_status_createdAt_idx" ON "MediaFile"("status", "createdAt");
