import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType, Prisma, VideoProcessingTargetType } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { VIDEO_PROCESSING_HEARTBEAT, VIDEO_PROCESSING_QUEUE, VideoProcessingPayload } from './video-processing.constants';
import { redisConnection } from './redis-connection';
import { AssociateVideoProcessingDto, ConfigureVideoProcessingDto, EnqueueVideoProcessingDto } from './video-processing.dto';

type JobWithMedia = Prisma.VideoProcessingJobGetPayload<{ include: { inputMediaFile: { select: { id: true; originalName: true; relativePath: true; status: true; width: true; height: true; durationSec: true; extension: true; videoCodec: true; audioCodec: true } }; outputMediaFile: { select: { id: true; relativePath: true } } } }>;
type ExtractedSubtitle = { url: string; language: string; label: string; originalName: string };

@Injectable()
export class VideoProcessingService implements OnModuleDestroy {
  private readonly queue: Queue<VideoProcessingPayload>;
  private readonly redis: IORedis;
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly storage: ObjectStorageService) {
    this.queue = new Queue<VideoProcessingPayload>(VIDEO_PROCESSING_QUEUE, { connection: redisConnection(config) });
    this.redis = new IORedis(config.get<string>('REDIS_URL') ?? 'redis://redis:6379', { maxRetriesPerRequest: 1 });
  }

  isEnabled() { return String(this.config.get<string>('ENABLE_HLS') ?? 'true').toLowerCase() === 'true'; }

  async enqueue(requestedById: string, mediaFileId: string, options: EnqueueVideoProcessingDto = {}) {
    const media = await this.prisma.mediaFile.findFirst({ where: { id: mediaFileId, mediaType: MediaType.VIDEO } });
    if (!media) throw new NotFoundException('Video de entrada no encontrado');
    if (!['.mp4', '.mkv'].includes(media.extension.toLowerCase())) throw new ConflictException('Solo se pueden procesar archivos MP4 o MKV');
    if (!this.isEnabled()) {
      if (media.extension.toLowerCase() === '.mkv') throw new ConflictException('La conversion HLS debe estar habilitada para aceptar archivos MKV');
      return null;
    }
    if (options.targetType || options.targetId) await this.assertTarget(options.targetType, options.targetId);
    const active = await this.prisma.videoProcessingJob.findFirst({ where: { inputMediaFileId: media.id, status: { in: ['QUEUED', 'PROCESSING'] } }, include: this.mediaInclude() });
    if (active) return this.present(active);
    const retainOriginal = options.retainOriginal ?? String(this.config.get<string>('VIDEO_KEEP_ORIGINAL_DEFAULT') ?? this.config.get<string>('KEEP_ORIGINAL_VIDEO') ?? 'true').toLowerCase() === 'true';
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.videoProcessingJob.create({ data: { requestedById, inputMediaFileId: media.id, retainOriginal, attempts: 1, processingStage: 'QUEUED', targetType: options.targetType, targetId: options.targetId, sourceWidth: media.width, sourceHeight: media.height, durationSec: media.durationSec, sourceVideoCodec: media.videoCodec, sourceAudioCodecs: media.audioCodec ? [media.audioCodec] : [] } });
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
    if (!await this.storage.exists(current.inputMediaFile.relativePath)) throw new ConflictException('El archivo original ya no esta disponible');
    const attempts = current.attempts + 1;
    const maxAttempts = Math.max(1, Math.min(10, Number(this.config.get<string>('VIDEO_MAX_RETRIES') ?? 3)));
    if (attempts > maxAttempts) throw new ConflictException(`El trabajo alcanzo el limite de ${maxAttempts} intentos`);
    await this.prisma.$transaction([
      this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'QUEUED', progress: 0, processingStage: 'QUEUED', attempts, cancelRequested: false, errorMessage: null, startedAt: null, completedAt: null, queueJobId: null } }),
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
        this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'CANCELLED', processingStage: 'CANCELLED', cancelRequested: true, completedAt: new Date(), errorMessage: 'Procesamiento cancelado por el administrador' } }),
        this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.READY } }),
      ]);
    } else await this.prisma.videoProcessingJob.update({ where: { id }, data: { cancelRequested: true } });
    return this.get(id);
  }

  async configure(id: string, dto: ConfigureVideoProcessingDto) {
    await this.find(id);
    const updated = await this.prisma.videoProcessingJob.update({ where: { id }, data: { retainOriginal: dto.retainOriginal }, include: this.mediaInclude() });
    if (!dto.retainOriginal && updated.status === 'COMPLETED' && updated.associatedAt) await this.removeOriginalAfterAssociation(updated);
    return this.get(id);
  }

  async associate(id: string, dto: AssociateVideoProcessingDto) {
    const current = await this.find(id);
    if (current.status !== 'COMPLETED' || !current.masterPath) throw new ConflictException('El HLS debe estar completado antes de asociarlo');
    await this.assertTarget(dto.targetType, dto.targetId);
    const videoUrl = this.storage.publicUrl(current.masterPath);
    const thumbnailUrl = current.thumbnailPath ? this.storage.publicUrl(current.thumbnailPath) : undefined;
    const subtitles = this.extractedSubtitles(current.subtitleTracks);
    await this.prisma.$transaction(async (tx) => {
      if (dto.targetType === VideoProcessingTargetType.EPISODE) {
        await tx.episode.update({ where: { id: dto.targetId }, data: { videoSource: 'HLS', videoType: 'HLS', videoUrl, processedVideoUrl: videoUrl, thumbnailUrl, durationSec: current.durationSec ? Math.round(current.durationSec) : undefined } });
      } else {
        await tx.movie.update({ where: { id: dto.targetId }, data: { videoSource: 'HLS', videoType: 'HLS', videoUrl, processedVideoUrl: videoUrl, posterUrl: thumbnailUrl, duration: current.durationSec ? Math.max(1, Math.round(current.durationSec / 60)) : undefined } });
      }
      for (const [index, track] of subtitles.entries()) {
        const target = dto.targetType === VideoProcessingTargetType.EPISODE ? { episodeId: dto.targetId } : { movieId: dto.targetId };
        const exists = await tx.subtitleTrack.count({ where: { ...target, language: track.language, url: track.url } });
        if (!exists) await tx.subtitleTrack.create({ data: { ...target, language: track.language, label: track.label, url: track.url, originalName: track.originalName, sourceFormat: 'VTT', isDefault: index === 0, isActive: true } });
      }
      await tx.videoProcessingJob.update({ where: { id }, data: { targetType: dto.targetType, targetId: dto.targetId, associatedAt: new Date(), processingStage: 'COMPLETED' } });
    });
    const associated = await this.find(id);
    if (!associated.retainOriginal) await this.removeOriginalAfterAssociation(associated);
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
      const failed = await this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'FAILED', processingStage: 'FAILED', errorMessage: message, completedAt: new Date() }, include: this.mediaInclude() });
      await this.prisma.mediaFile.update({ where: { id: failed.inputMediaFileId }, data: { status: MediaStatus.FAILED, errorMessage: message } });
      return this.present(failed);
    }
  }

  private async find(id: string) {
    const job = await this.prisma.videoProcessingJob.findUnique({ where: { id }, include: this.mediaInclude() });
    if (!job) throw new NotFoundException('Trabajo de procesamiento no encontrado');
    return job;
  }

  private mediaInclude() { return { inputMediaFile: { select: { id: true, originalName: true, relativePath: true, status: true, width: true, height: true, durationSec: true, extension: true, videoCodec: true, audioCodec: true } }, outputMediaFile: { select: { id: true, relativePath: true } } } as const; }
  private present(job: JobWithMedia) { return { id: job.id, status: job.status, progress: job.progress, stage: job.processingStage, profiles: job.profiles, generatedQualities: job.generatedQualities, attempts: job.attempts, errorMessage: job.errorMessage, retainOriginal: job.retainOriginal, cancelRequested: job.cancelRequested, sourceFormat: job.sourceFormat, sourceVideoCodec: job.sourceVideoCodec, sourceAudioCodecs: job.sourceAudioCodecs, sourceWidth: job.sourceWidth, sourceHeight: job.sourceHeight, durationSec: job.durationSec, audioTracks: job.audioTracks, subtitleTracks: job.subtitleTracks, targetType: job.targetType, targetId: job.targetId, associatedAt: job.associatedAt, masterUrl: job.masterPath ? this.storage.publicUrl(job.masterPath) : null, thumbnailUrl: job.thumbnailPath ? this.storage.publicUrl(job.thumbnailPath) : null, input: job.inputMediaFile, outputMediaId: job.outputMediaFileId, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt, updatedAt: job.updatedAt }; }

  private async assertTarget(targetType?: VideoProcessingTargetType, targetId?: string) {
    if (!targetType || !targetId) throw new BadRequestException('Indica targetType y targetId');
    const exists = targetType === VideoProcessingTargetType.EPISODE
      ? await this.prisma.episode.count({ where: { id: targetId, deletedAt: null } })
      : await this.prisma.movie.count({ where: { id: targetId, deletedAt: null } });
    if (!exists) throw new NotFoundException(targetType === VideoProcessingTargetType.EPISODE ? 'Episodio no encontrado' : 'Pelicula no encontrada');
  }

  private extractedSubtitles(value: Prisma.JsonValue): ExtractedSubtitle[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, Prisma.JsonValue>;
      return typeof record.url === 'string' && typeof record.language === 'string' && typeof record.label === 'string' && typeof record.originalName === 'string'
        ? [{ url: record.url, language: record.language, label: record.label, originalName: record.originalName }]
        : [];
    });
  }

  private async removeOriginalAfterAssociation(job: JobWithMedia) {
    if (!job.associatedAt) return;
    await this.storage.delete(job.inputMediaFile.relativePath);
    await this.prisma.mediaFile.update({ where: { id: job.inputMediaFileId }, data: { status: MediaStatus.DELETED, errorMessage: null } });
  }
}
