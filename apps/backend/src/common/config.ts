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
  return env;
}

export function parseDuration(value: string, fallbackMs: number) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * factors[match[2] as keyof typeof factors];
}
