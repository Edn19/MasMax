import { ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType, VideoProcessingJob } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { VIDEO_PROCESSING_HEARTBEAT, VIDEO_PROCESSING_QUEUE, VideoProcessingPayload } from './video-processing.constants';
import { redisConnection } from './redis-connection';

type JobWithMedia = VideoProcessingJob & {
  inputMediaFile: { id: string; originalName: string; relativePath: string; status: MediaStatus; width: number | null; height: number | null; durationSec: number | null };
  outputMediaFile: { id: string; relativePath: string } | null;
};

@Injectable()
export class VideoProcessingService implements OnModuleDestroy {
  private readonly queue: Queue<VideoProcessingPayload>;
  private readonly redis: IORedis;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly storage: ObjectStorageService) {
    this.queue = new Queue<VideoProcessingPayload>(VIDEO_PROCESSING_QUEUE, { connection: redisConnection(config) });
    this.redis = new IORedis(config.get<string>('REDIS_URL') ?? 'redis://redis:6379', { maxRetriesPerRequest: 1 });
  }

  isEnabled() { return String(this.config.get<string>('ENABLE_HLS') ?? 'true').toLowerCase() === 'true'; }

  async enqueue(requestedById: string, mediaFileId: string) {
    if (!this.isEnabled()) return null;
    const media = await this.prisma.mediaFile.findFirst({ where: { id: mediaFileId, mediaType: MediaType.VIDEO } });
    if (!media) throw new NotFoundException('Video de entrada no encontrado');
    if (media.extension.toLowerCase() !== '.mp4') throw new ConflictException('Solo se pueden procesar archivos MP4');
    const active = await this.prisma.videoProcessingJob.findFirst({ where: { inputMediaFileId: media.id, status: { in: ['QUEUED', 'PROCESSING'] } }, include: this.mediaInclude() });
    if (active) return this.present(active);
    const retainOriginal = String(this.config.get<string>('KEEP_ORIGINAL_VIDEO') ?? 'true').toLowerCase() === 'true';
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.videoProcessingJob.create({ data: { requestedById, inputMediaFileId: media.id, retainOriginal, attempts: 1 } });
      await tx.mediaFile.update({ where: { id: media.id }, data: { status: MediaStatus.QUEUED, errorMessage: null } });
      return created;
    });
    return this.addToQueue(job.id, 1);
  }

  async list() {
    const jobs = await this.prisma.videoProcessingJob.findMany({ include: this.mediaInclude(), orderBy: { createdAt: 'desc' }, take: 100 });
    return jobs.map((job) => this.present(job));
  }

  async get(id: string) { return this.present(await this.find(id)); }

  async retry(id: string) {
    const current = await this.find(id);
    if (!['FAILED', 'CANCELLED'].includes(current.status)) throw new ConflictException('Solo se pueden reintentar trabajos fallidos o cancelados');
    if (!await this.storage.exists(current.inputMediaFile.relativePath)) throw new ConflictException('El archivo MP4 original ya no esta disponible');
    const attempts = current.attempts + 1;
    await this.prisma.$transaction([
      this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'QUEUED', progress: 0, attempts, cancelRequested: false, errorMessage: null, startedAt: null, completedAt: null, queueJobId: null } }),
      this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.QUEUED, errorMessage: null } }),
    ]);
    return this.addToQueue(id, attempts);
  }

  async cancel(id: string) {
    const current = await this.find(id);
    if (!['QUEUED', 'PROCESSING'].includes(current.status)) throw new ConflictException('El trabajo ya no se puede cancelar');
    if (current.status === 'QUEUED' && current.queueJobId) {
      await (await this.queue.getJob(current.queueJobId))?.remove().catch(() => undefined);
      await this.prisma.$transaction([
        this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'CANCELLED', cancelRequested: true, completedAt: new Date(), errorMessage: 'Procesamiento cancelado por el administrador' } }),
        this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.READY } }),
      ]);
    } else await this.prisma.videoProcessingJob.update({ where: { id }, data: { cancelRequested: true } });
    return this.get(id);
  }

  async health() {
    try {
      await this.redis.ping();
      const heartbeat = await this.redis.get(VIDEO_PROCESSING_HEARTBEAT);
      return { queue: 'ok', worker: heartbeat && Date.now() - Number(heartbeat) < 45_000 ? 'ok' : 'unavailable', heartbeat: heartbeat ? new Date(Number(heartbeat)).toISOString() : null };
    } catch (error) { return { queue: 'error', worker: 'unavailable', error: error instanceof Error ? error.message : 'Redis no disponible' }; }
  }

  async onModuleDestroy() { await this.queue.close(); this.redis.disconnect(); }

  private async addToQueue(id: string, attempt: number) {
    const queueJobId = `video-${id}-${attempt}`;
    try {
      await this.queue.add('transcode', { processingJobId: id }, { jobId: queueJobId, removeOnComplete: 100, removeOnFail: 200 });
      const job = await this.prisma.videoProcessingJob.update({ where: { id }, data: { queueJobId }, include: this.mediaInclude() });
      return this.present(job);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'No se pudo enviar el trabajo a Redis';
      const failed = await this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'FAILED', errorMessage: message, completedAt: new Date() }, include: this.mediaInclude() });
      await this.prisma.mediaFile.update({ where: { id: failed.inputMediaFileId }, data: { status: MediaStatus.FAILED, errorMessage: message } });
      return this.present(failed);
    }
  }

  private async find(id: string) {
    const job = await this.prisma.videoProcessingJob.findUnique({ where: { id }, include: this.mediaInclude() });
    if (!job) throw new NotFoundException('Trabajo de procesamiento no encontrado');
    return job;
  }

  private mediaInclude() { return { inputMediaFile: { select: { id: true, originalName: true, relativePath: true, status: true, width: true, height: true, durationSec: true } }, outputMediaFile: { select: { id: true, relativePath: true } } } as const; }
  private present(job: JobWithMedia) { return { id: job.id, status: job.status, progress: job.progress, profiles: job.profiles, attempts: job.attempts, errorMessage: job.errorMessage, retainOriginal: job.retainOriginal, cancelRequested: job.cancelRequested, sourceWidth: job.sourceWidth, sourceHeight: job.sourceHeight, durationSec: job.durationSec, masterUrl: job.masterPath ? this.storage.publicUrl(job.masterPath) : null, thumbnailUrl: job.thumbnailPath ? this.storage.publicUrl(job.thumbnailPath) : null, input: job.inputMediaFile, outputMediaId: job.outputMediaFileId, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt, updatedAt: job.updatedAt }; }
}
