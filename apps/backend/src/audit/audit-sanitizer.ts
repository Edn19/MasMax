import { Prisma } from '@prisma/client';

const sensitiveKey = /(?:password|passwd|passwordhash|token|secret|authorization|cookie|pin|smtp.*pass|s3.*(?:access|secret).*key)/i;
const redacted = '[REDACTED]';

export function sanitizeAuditValue(value: unknown, key = '', depth = 0): Prisma.JsonValue | undefined {
  if (sensitiveKey.test(key)) return redacted;
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (depth > 8) return '[MAX_DEPTH]';
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}...[TRUNCATED]` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeAuditValue(item, key, depth + 1) ?? null);
  }
  if (typeof value === 'object') {
    const output: Record<string, Prisma.JsonValue> = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 200)) {
      const sanitized = sanitizeAuditValue(childValue, childKey, depth + 1);
      if (sanitized !== undefined) output[childKey] = sanitized;
    }
    return output;
  }
  return String(value);
}
