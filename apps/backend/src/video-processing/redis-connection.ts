import { ConfigService } from '@nestjs/config';
import { ConnectionOptions } from 'bullmq';

export function redisConnection(config: ConfigService): ConnectionOptions {
  const parsed = new URL(config.get<string>('REDIS_URL') ?? 'redis://redis:6379');
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('REDIS_URL debe usar redis:// o rediss://');
  const database = parsed.pathname.slice(1);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: database ? Number(database) : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
