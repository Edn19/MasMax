import { describe, expect, it } from 'vitest';
import { anonymizeIp } from './request-context';

describe('anonymizeIp', () => {
  it('summarizes IPv4 and IPv4-mapped addresses', () => {
    expect(anonymizeIp('203.0.113.42')).toBe('203.0.113.0/24');
    expect(anonymizeIp('::ffff:203.0.113.42')).toBe('203.0.113.0/24');
  });

  it('summarizes IPv6 addresses', () => {
    expect(anonymizeIp('2001:db8:1234:5678:9abc:def0:1234:5678')).toBe('2001:db8:1234:5678::/64');
  });
});
