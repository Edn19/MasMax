import { describe, expect, it } from 'vitest';
import { sanitizeAuditValue } from './audit-sanitizer';

describe('sanitizeAuditValue', () => {
  it('redacts credentials recursively without dropping useful changes', () => {
    expect(sanitizeAuditValue({ email: 'admin@site.local', password: 'Admin123456', nested: { accessToken: 'jwt', role: 'ADMIN' } })).toEqual({
      email: 'admin@site.local',
      password: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', role: 'ADMIN' },
    });
  });

  it('serializes dates and bigints safely', () => {
    expect(sanitizeAuditValue({ at: new Date('2026-08-03T00:00:00.000Z'), bytes: 42n })).toEqual({ at: '2026-08-03T00:00:00.000Z', bytes: '42' });
  });
});
