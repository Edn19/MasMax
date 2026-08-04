import IORedis from 'ioredis';
import { VIDEO_PROCESSING_HEARTBEAT } from './video-processing.constants';

async function check() {
  const client = new IORedis(process.env.REDIS_URL ?? 'redis://redis:6379', { connectTimeout: 3000, maxRetriesPerRequest: 1 });
  try {
    const heartbeat = await client.get(VIDEO_PROCESSING_HEARTBEAT);
    if (!heartbeat || Date.now() - Number(heartbeat) >= 45_000) process.exitCode = 1;
  } catch { process.exitCode = 1; }
  finally { client.disconnect(); }
}

void check();
