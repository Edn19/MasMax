const MIB = 1024 * 1024;

export type UploadsConfig = {
  maxVideoUploadBytes: number;
  resumableChunkSizeBytes: number;
  resumableChunkRequestLimitBytes: number;
  maxRetryAttempts: number;
  uploadExpirationHours: number;
};

function positiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum?: number) {
  const raw = env[name];
  const value = raw === undefined || raw.trim() === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || (maximum !== undefined && value > maximum)) {
    const range = maximum === undefined ? `al menos ${minimum}` : `entre ${minimum} y ${maximum}`;
    throw new Error(`${name} debe ser un entero ${range}`);
  }
  return value;
}

export function parseUploadsConfig(env: NodeJS.ProcessEnv): UploadsConfig {
  const maxVideoUploadMb = positiveInteger(
    env,
    'MAX_VIDEO_UPLOAD_MB',
    positiveInteger(env, 'VIDEO_MAX_UPLOAD_SIZE_MB', 2048, 2),
    2,
  );
  const chunkSizeMb = positiveInteger(env, 'RESUMABLE_CHUNK_SIZE_MB', 16, 1, 64);
  const requestOverheadMb = positiveInteger(env, 'RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB', 2, 1, 64);
  const maxRetryAttempts = positiveInteger(env, 'RESUMABLE_UPLOAD_MAX_RETRIES', 5, 1, 10);
  const uploadExpirationHours = positiveInteger(
    env,
    'RESUMABLE_UPLOAD_EXPIRATION_HOURS',
    positiveInteger(env, 'RESUMABLE_UPLOAD_EXPIRES_HOURS', 24, 1),
    1,
  );
  const maxVideoUploadBytes = maxVideoUploadMb * MIB;
  const resumableChunkSizeBytes = chunkSizeMb * MIB;
  if (!Number.isSafeInteger(maxVideoUploadBytes) || maxVideoUploadBytes <= resumableChunkSizeBytes) {
    throw new Error('MAX_VIDEO_UPLOAD_MB debe ser mayor que RESUMABLE_CHUNK_SIZE_MB');
  }
  return {
    maxVideoUploadBytes,
    resumableChunkSizeBytes,
    resumableChunkRequestLimitBytes: resumableChunkSizeBytes + requestOverheadMb * MIB,
    maxRetryAttempts,
    uploadExpirationHours,
  };
}

export const uploadsConfig = parseUploadsConfig(process.env);
