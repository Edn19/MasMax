import { parseUploadsConfig } from '../uploads/uploads.config';

const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'MEDIA_SIGNING_SECRET'] as const;

export function validateEnvironment(input: Record<string, unknown>) {
  const env = { ...input } as Record<string, string>;
  for (const key of required) {
    if (!env[key] || env[key].length < 24) {
      throw new Error(`${key} es obligatorio y debe tener al menos 24 caracteres`);
    }
  }
  const mode = env.REGISTRATION_MODE ?? 'disabled';
  if (!['open', 'invite', 'admin_only', 'disabled'].includes(mode)) {
    throw new Error('REGISTRATION_MODE debe ser open, invite, admin_only o disabled');
  }
  const storageDriver = env.STORAGE_DRIVER ?? 'local';
  if (!['local', 's3'].includes(storageDriver)) throw new Error('STORAGE_DRIVER debe ser local o s3');
  if (storageDriver === 's3') {
    for (const key of ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
      if (!env[key]) throw new Error(`${key} es obligatorio cuando STORAGE_DRIVER=s3`);
    }
  }
  const redisUrl = env.REDIS_URL ?? 'redis://redis:6379';
  try { const parsed = new URL(redisUrl); if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error(); }
  catch { throw new Error('REDIS_URL debe ser una URL redis:// o rediss:// valida'); }
  const concurrency = Number(env.VIDEO_WORKER_CONCURRENCY ?? env.FFMPEG_CONCURRENCY ?? 1);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('VIDEO_WORKER_CONCURRENCY debe estar entre 1 y 4');
  const threads = Number(env.FFMPEG_THREADS ?? 2);
  if (!Number.isInteger(threads) || threads < 1 || threads > 8) throw new Error('FFMPEG_THREADS debe estar entre 1 y 8');
  const crf = Number(env.FFMPEG_CRF ?? 21);
  if (!Number.isInteger(crf) || crf < 16 || crf > 32) throw new Error('FFMPEG_CRF debe estar entre 16 y 32');
  const segmentDuration = Number(env.HLS_SEGMENT_DURATION ?? env.HLS_SEGMENT_SECONDS ?? 6);
  if (!Number.isInteger(segmentDuration) || segmentDuration < 2 || segmentDuration > 15) throw new Error('HLS_SEGMENT_DURATION debe estar entre 2 y 15');
  const auditRetentionDays = Number(env.AUDIT_RETENTION_DAYS ?? 365);
  if (!Number.isInteger(auditRetentionDays) || auditRetentionDays < 30 || auditRetentionDays > 3650) throw new Error('AUDIT_RETENTION_DAYS debe estar entre 30 y 3650');
  parseUploadsConfig(env);
  return env;
}

export function parseDuration(value: string, fallbackMs: number) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * factors[match[2] as keyof typeof factors];
}
