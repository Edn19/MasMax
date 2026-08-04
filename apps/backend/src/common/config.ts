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
  const concurrency = Number(env.FFMPEG_CONCURRENCY ?? 1);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('FFMPEG_CONCURRENCY debe estar entre 1 y 4');
  const auditRetentionDays = Number(env.AUDIT_RETENTION_DAYS ?? 365);
  if (!Number.isInteger(auditRetentionDays) || auditRetentionDays < 30 || auditRetentionDays > 3650) throw new Error('AUDIT_RETENTION_DAYS debe estar entre 30 y 3650');
  return env;
}

export function parseDuration(value: string, fallbackMs: number) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * factors[match[2] as keyof typeof factors];
}
