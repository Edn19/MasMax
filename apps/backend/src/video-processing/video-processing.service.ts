import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType, Prisma, VideoProcessingKind, VideoProcessingTargetType } from '@prisma/client';
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
    return this.enqueueKind(requestedById, mediaFileId, VideoProcessingKind.HLS, options);
  }

  async enqueueRemux(requestedById: string, mediaFileId: string, options: EnqueueVideoProcessingDto = {}) {
    return this.enqueueKind(requestedById, mediaFileId, VideoProcessingKind.REMUX, options);
  }

  private async enqueueKind(requestedById: string, mediaFileId: string, kind: VideoProcessingKind, options: EnqueueVideoProcessingDto) {
    const media = await this.prisma.mediaFile.findFirst({ where: { id: mediaFileId, mediaType: MediaType.VIDEO } });
    if (!media) throw new NotFoundException('Video de entrada no encontrado');
    if (!['.mp4', '.mkv', '.mov', '.webm'].includes(media.extension.toLowerCase())) throw new ConflictException('Solo se pueden procesar archivos MP4, MKV, MOV o WebM');
    if (kind === VideoProcessingKind.HLS && !this.isEnabled()) {
      if (media.extension.toLowerCase() === '.mkv') throw new ConflictException('La conversion HLS debe estar habilitada para aceptar archivos MKV');
      return null;
    }
    if (options.targetType || options.targetId) await this.assertTarget(options.targetType, options.targetId);
    const retainOriginal = options.retainOriginal ?? String(this.config.get<string>('VIDEO_KEEP_ORIGINAL_DEFAULT') ?? this.config.get<string>('KEEP_ORIGINAL_VIDEO') ?? 'true').toLowerCase() === 'true';
    const reserved = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${media.id}:${kind}`}))`;
      const active = await tx.videoProcessingJob.findFirst({ where: { inputMediaFileId: media.id, kind, status: { in: ['QUEUED', 'PROCESSING'] } }, include: this.mediaInclude(), orderBy: { createdAt: 'desc' } });
      if (active) {
        if (active.requestedById !== requestedById) throw new ConflictException('El archivo ya pertenece a otro trabajo de procesamiento');
        return { created: false as const, job: active };
      }
      const completed = await tx.videoProcessingJob.findFirst({ where: { inputMediaFileId: media.id, kind, status: 'COMPLETED', outputMediaFileId: { not: null } }, include: this.mediaInclude(), orderBy: { completedAt: 'desc' } });
      if (completed) return { created: false as const, job: completed };
      const created = await tx.videoProcessingJob.create({ data: { requestedById, inputMediaFileId: media.id, kind, retainOriginal, attempts: 1, processingStage: 'QUEUED', targetType: options.targetType, targetId: options.targetId, sourceWidth: media.width, sourceHeight: media.height, durationSec: media.durationSec, sourceVideoCodec: media.videoCodec, sourceAudioCodecs: media.audioCodec ? [media.audioCodec] : [] } });
      await tx.mediaFile.update({ where: { id: media.id }, data: { status: MediaStatus.QUEUED, errorMessage: null } });
      return { created: true as const, job: await tx.videoProcessingJob.findUniqueOrThrow({ where: { id: created.id }, include: this.mediaInclude() }) };
    });
    if (!reserved.created) {
      if (reserved.job.status === 'COMPLETED') {
        const outputPath = kind === VideoProcessingKind.HLS ? reserved.job.masterPath : reserved.job.outputMediaFile?.relativePath;
        if (!outputPath || !await this.storage.exists(outputPath)) throw new ConflictException(`La version ${kind} registrada no existe en el almacenamiento; requiere reconciliacion antes de reintentar`);
      }
      return this.present(reserved.job);
    }
    return this.addToQueue(reserved.job.id, 1);
  }

  async list() {
    const jobs = await this.prisma.videoProcessingJob.findMany({ include: this.mediaInclude(), orderBy: { createdAt: 'desc' }, take: 100 });
    return jobs.map((job) => this.present(job));
  }

  async listActive() {
    const jobs = await this.prisma.videoProcessingJob.findMany({ where: { status: { in: ['QUEUED', 'PROCESSING'] } }, include: this.mediaInclude(), orderBy: { createdAt: 'desc' } });
    return jobs.map((job) => this.present(job));
  }

  async listAvailable(requestedById: string) {
    const jobs = await this.prisma.videoProcessingJob.findMany({
      where: { requestedById, targetType: null, targetId: null, status: { in: ['QUEUED', 'PROCESSING', 'COMPLETED'] } },
      include: this.mediaInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return jobs.filter((job) => job.status !== 'COMPLETED' || Boolean(job.outputMediaFileId)).map((job) => this.present(job));
  }

  async byTarget(targetType: VideoProcessingTargetType, targetId: string) {
    await this.assertTarget(targetType, targetId);
    const job = await this.prisma.videoProcessingJob.findFirst({ where: { targetType, targetId }, include: this.mediaInclude(), orderBy: { createdAt: 'desc' } });
    return job ? this.present(job) : null;
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

  async configure(id: string, dto: ConfigureVideoProcessingDto, requestedById: string) {
    const current = await this.findOwned(id, requestedById);
    const hasTarget = dto.targetType !== undefined || dto.targetId !== undefined;
    if (dto.retainOriginal === undefined && !hasTarget) throw new BadRequestException('Indica una configuracion para actualizar');
    if (hasTarget) {
      if (!dto.targetType || !dto.targetId) throw new BadRequestException('Indica targetType y targetId');
      await this.assertTarget(dto.targetType, dto.targetId);
      if ((current.targetType || current.targetId) && (current.targetType !== dto.targetType || current.targetId !== dto.targetId)) throw new ConflictException('El trabajo ya esta asociado a otro contenido');
    }
    const updated = await this.prisma.videoProcessingJob.update({ where: { id }, data: { retainOriginal: dto.retainOriginal, targetType: dto.targetType, targetId: dto.targetId }, include: this.mediaInclude() });
    if (dto.targetType && dto.targetId && updated.status === 'COMPLETED' && !updated.associatedAt) return this.associate(id, { targetType: dto.targetType, targetId: dto.targetId }, requestedById);
    if (dto.retainOriginal === false && updated.status === 'COMPLETED' && updated.associatedAt) await this.removeOriginalAfterAssociation(updated);
    return this.get(id);
  }

  async associate(id: string, dto: AssociateVideoProcessingDto, requestedById: string) {
    return this.associateInternal(id, dto, requestedById);
  }

  async associateAsAdmin(id: string, dto: AssociateVideoProcessingDto, _adminId: string) {
    return this.associateInternal(id, dto);
  }

  private async associateInternal(id: string, dto: AssociateVideoProcessingDto, requestedById?: string) {
    const current = requestedById ? await this.findOwned(id, requestedById) : await this.find(id);
    if (current.status !== 'COMPLETED' || !current.outputMediaFile) throw new ConflictException('La version procesada debe estar completada antes de asociarla');
    await this.assertTarget(dto.targetType, dto.targetId);
    if ((current.targetType || current.targetId) && (current.targetType !== dto.targetType || current.targetId !== dto.targetId)) throw new ConflictException('El trabajo ya esta asociado a otro contenido');
    const outputPath = current.kind === VideoProcessingKind.HLS ? current.masterPath : current.outputMediaFile.relativePath;
    if (!outputPath) throw new ConflictException('La salida procesada no tiene una ruta valida');
    const videoUrl = this.storage.publicUrl(outputPath);
    const thumbnailUrl = current.thumbnailPath ? this.storage.publicUrl(current.thumbnailPath) : undefined;
    const subtitles = this.extractedSubtitles(current.subtitleTracks);
    await this.prisma.$transaction(async (tx) => {
      if (dto.targetType === VideoProcessingTargetType.EPISODE) {
        const episode = await tx.episode.findUniqueOrThrow({ where: { id: dto.targetId }, select: { playbackMode: true } });
        await tx.episode.update({ where: { id: dto.targetId }, data: { mediaFileId: current.inputMediaFileId, originalVideoUrl: this.storage.publicUrl(current.inputMediaFile.relativePath), ...(current.kind === VideoProcessingKind.HLS ? { processedVideoUrl: videoUrl } : { remuxedVideoUrl: videoUrl }), thumbnailUrl, durationSec: current.durationSec ? Math.round(current.durationSec) : undefined, ...(episode.playbackMode === current.kind ? { videoSource: current.kind === VideoProcessingKind.HLS ? 'HLS' : 'LOCAL', videoType: current.kind === VideoProcessingKind.HLS ? 'HLS' : 'MP4', videoUrl } : {}) } });
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

  private async findOwned(id: string, requestedById: string) {
    const job = await this.prisma.videoProcessingJob.findFirst({ where: { id, requestedById }, include: this.mediaInclude() });
    if (!job) throw new NotFoundException('Trabajo de procesamiento no encontrado');
    return job;
  }

  private mediaInclude() { return { inputMediaFile: { select: { id: true, originalName: true, relativePath: true, status: true, width: true, height: true, durationSec: true, extension: true, videoCodec: true, audioCodec: true } }, outputMediaFile: { select: { id: true, relativePath: true } } } as const; }
  private present(job: JobWithMedia) { const outputPath = job.kind === VideoProcessingKind.HLS ? job.masterPath : job.outputMediaFile?.relativePath; return { id: job.id, kind: job.kind, requestedById: job.requestedById, originalName: job.inputMediaFile.originalName, status: job.status, progress: job.progress, stage: job.processingStage, profiles: job.profiles, generatedQualities: job.generatedQualities, attempts: job.attempts, errorMessage: job.errorMessage, retainOriginal: job.retainOriginal, cancelRequested: job.cancelRequested, sourceFormat: job.sourceFormat, sourceVideoCodec: job.sourceVideoCodec, sourceAudioCodecs: job.sourceAudioCodecs, sourceWidth: job.sourceWidth, sourceHeight: job.sourceHeight, durationSec: job.durationSec, audioTracks: job.audioTracks, subtitleTracks: job.subtitleTracks, targetType: job.targetType, targetId: job.targetId, associatedAt: job.associatedAt, masterUrl: job.masterPath ? this.storage.publicUrl(job.masterPath) : null, outputUrl: outputPath ? this.storage.publicUrl(outputPath) : null, thumbnailUrl: job.thumbnailPath ? this.storage.publicUrl(job.thumbnailPath) : null, input: job.inputMediaFile, outputMediaId: job.outputMediaFileId, createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt, updatedAt: job.updatedAt }; }

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
    const originalUrl = this.storage.publicUrl(job.inputMediaFile.relativePath);
    const [episodeReferences, movieReferences] = await Promise.all([
      this.prisma.episode.count({ where: { deletedAt: null, OR: [{ mediaFileId: job.inputMediaFileId }, { originalVideoUrl: originalUrl }] } }),
      this.prisma.movie.count({ where: { deletedAt: null, originalVideoUrl: originalUrl } }),
    ]);
    if (episodeReferences + movieReferences > 1) {
      await this.prisma.videoProcessingJob.update({ where: { id: job.id }, data: { retainOriginal: true } });
      return;
    }
    await this.storage.delete(job.inputMediaFile.relativePath);
    await this.prisma.mediaFile.update({ where: { id: job.inputMediaFileId }, data: { status: MediaStatus.DELETED, errorMessage: null } });
  }
}
