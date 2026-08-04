export type ResumableFileIdentity = {
  originalName: string;
  size: number;
  mimeType: string;
  lastModified: number | null;
};

export type LocalFileIdentity = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
};

export function resumableChunkMimeType(fileType: string) {
  return fileType || 'application/octet-stream';
}

export function matchesResumableFile(session: ResumableFileIdentity, file: LocalFileIdentity) {
  const sameMime = !session.mimeType || !file.type || session.mimeType === file.type;
  const sameModified = session.lastModified === null || session.lastModified === file.lastModified;
  return session.originalName === file.name && session.size === file.size && sameMime && sameModified;
}

export function isRetryableUploadError(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error) || typeof error.status !== 'number') return false;
  return error.status === 0 || [408, 429, 500, 502, 503, 504].includes(error.status);
}

export function retryDelayMs(failedAttempt: number, random = Math.random()) {
  return Math.min(16_000, 1000 * 2 ** Math.max(0, failedAttempt - 1)) + Math.floor(random * 250);
}
