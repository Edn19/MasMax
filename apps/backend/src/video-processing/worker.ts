import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { redisConnection } from './redis-connection';
import { VIDEO_PROCESSING_HEARTBEAT, VIDEO_PROCESSING_QUEUE, VideoProcessingPayload } from './video-processing.constants';
import { VideoProcessingProcessor } from './video-processing.processor';
import { WorkerAppModule } from './worker-app.module';

async function bootstrap() {
  const logger = new Logger('VideoProcessingWorker');
  const app = await NestFactory.createApplicationContext(WorkerAppModule, { logger: ['log', 'error', 'warn'] });
  const config = app.get(ConfigService);
  const processor = app.get(VideoProcessingProcessor);
  const concurrency = Math.max(1, Math.min(4, Number(config.get<string>('FFMPEG_CONCURRENCY') ?? 1)));
  const worker = new Worker<VideoProcessingPayload>(VIDEO_PROCESSING_QUEUE, (job) => processor.process(job.data.processingJobId), { connection: redisConnection(config), concurrency });
  const heartbeatClient = new IORedis(config.get<string>('REDIS_URL') ?? 'redis://redis:6379', { maxRetriesPerRequest: 1 });
  const heartbeat = async () => { await heartbeatClient.set(VIDEO_PROCESSING_HEARTBEAT, String(Date.now()), 'PX', 45_000); };
  await heartbeat();
  const heartbeatTimer = setInterval(() => void heartbeat().catch((error: Error) => logger.error(error.message)), 10_000);
  worker.on('completed', (job) => logger.log(`Trabajo ${job.id} completado`));
  worker.on('failed', (job, error) => logger.error(`Trabajo ${job?.id ?? 'desconocido'} fallo: ${error.message}`));
  worker.on('error', (error) => logger.error(error.message));
  logger.log(`Worker FFmpeg listo con concurrencia ${concurrency}`);
  const shutdown = async () => { clearInterval(heartbeatTimer); await worker.close(); heartbeatClient.disconnect(); await app.close(); process.exit(0); };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

void bootstrap();
