CREATE TYPE "ResumableUploadStatus" AS ENUM ('INITIATED', 'UPLOADING', 'ASSEMBLING', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');

CREATE TABLE "ResumableUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "chunkSize" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "uploadedParts" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "checksum" TEXT,
    "status" "ResumableUploadStatus" NOT NULL DEFAULT 'INITIATED',
    "result" JSONB,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResumableUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResumableUpload_userId_status_updatedAt_idx" ON "ResumableUpload"("userId", "status", "updatedAt");
CREATE INDEX "ResumableUpload_expiresAt_status_idx" ON "ResumableUpload"("expiresAt", "status");
ALTER TABLE "ResumableUpload" ADD CONSTRAINT "ResumableUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
