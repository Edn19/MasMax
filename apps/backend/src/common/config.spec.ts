import { describe, expect, it } from 'vitest';
import { parseDuration, validateEnvironment } from './config';

describe('configuracion segura', () => {
  it('rechaza secretos ausentes o cortos', () => {
    expect(() => validateEnvironment({ DATABASE_URL: 'short' })).toThrow('DATABASE_URL');
  });
  it('acepta una configuracion completa', () => {
    const secret = 'x'.repeat(32);
    expect(validateEnvironment({ DATABASE_URL: secret, JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, MEDIA_SIGNING_SECRET: secret, REGISTRATION_MODE: 'disabled' }).REGISTRATION_MODE).toBe('disabled');
  });
  it('convierte duraciones de tokens', () => { expect(parseDuration('15m', 0)).toBe(900_000); });
  it('exige credenciales completas al activar S3', () => {
    const secret = 'x'.repeat(32);
    expect(() => validateEnvironment({ DATABASE_URL: secret, JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, MEDIA_SIGNING_SECRET: secret, STORAGE_DRIVER: 's3' })).toThrow('S3_REGION');
  });
  it('rechaza conexiones Redis inseguras o invalidas', () => {
    const secret = 'x'.repeat(32);
    expect(() => validateEnvironment({ DATABASE_URL: secret, JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, MEDIA_SIGNING_SECRET: secret, REDIS_URL: 'http://redis:6379' })).toThrow('REDIS_URL');
  });
  it('limita la concurrencia FFmpeg', () => {
    const secret = 'x'.repeat(32);
    expect(() => validateEnvironment({ DATABASE_URL: secret, JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, MEDIA_SIGNING_SECRET: secret, VIDEO_WORKER_CONCURRENCY: '8' })).toThrow('VIDEO_WORKER_CONCURRENCY');
  });
  it('valida los limites conservadores de transcodificacion', () => {
    const secret = 'x'.repeat(32);
    expect(() => validateEnvironment({ DATABASE_URL: secret, JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, MEDIA_SIGNING_SECRET: secret, FFMPEG_THREADS: '32' })).toThrow('FFMPEG_THREADS');
    expect(() => validateEnvironment({ DATABASE_URL: secret, JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, MEDIA_SIGNING_SECRET: secret, HLS_SEGMENT_DURATION: '1' })).toThrow('HLS_SEGMENT_DURATION');
  });
  it('rechaza configuracion inconsistente de subidas reanudables', () => {
    const secret = 'x'.repeat(32);
    const base = { DATABASE_URL: secret, JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, MEDIA_SIGNING_SECRET: secret };
    expect(() => validateEnvironment({ ...base, RESUMABLE_CHUNK_SIZE_MB: '0' })).toThrow('RESUMABLE_CHUNK_SIZE_MB');
    expect(() => validateEnvironment({ ...base, MAX_VIDEO_UPLOAD_MB: '16', RESUMABLE_CHUNK_SIZE_MB: '16' })).toThrow('MAX_VIDEO_UPLOAD_MB');
  });
});
