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
});
