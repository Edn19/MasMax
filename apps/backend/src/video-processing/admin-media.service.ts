import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MediaStatus, Prisma, ResumableUploadStatus, VideoProcessingTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { AdminMediaQueryDto } from './admin-media.dto';
import { VideoProcessingService } from './video-processing.service';
import { EnqueueVideoProcessingDto } from './video-processing.dto';
import { directPlaybackCompatibility } from './direct-playback';

const jobInclude = {
  inputMediaFile: { select: { id: true, originalName: true, relativePath: true, extension: true, sizeBytes: true, status: true, width: true, height: true } },
  outputMediaFile: { select: { id: true, relativePath: true, sizeBytes: true, status: true } },
} as const;

type MediaJob = Prisma.VideoProcessingJobGetPayload<{ include: typeof jobInclude }>;
type MediaContentType = 'EPISODE' | 'MOVIE' | 'UNASSIGNED' | 'UPLOAD';
type MediaItemStatus = 'UPLOADING' | 'ORIGINAL' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNASSIGNED';

export type AdminMediaItem = {
  id: string;
  entity: 'JOB' | 'UPLOAD' | 'FILE';
  contentType: MediaContentType;
  contentId: string | null;
  mediaFileId?: string | null;
  title: string;
  contentUrl: string | null;
  originalName: string | null;
  extension?: string | null;
  status: MediaItemStatus;
  stage: string | null;
  progress: number | null;
  resolution: string | null;
  qualities: number[];
  published: boolean;
  hlsUrl: string | null;
  originalUrl?: string | null;
  remuxUrl: string | null;
  hlsStatus?: 'NONE' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  hlsProgress?: number | null;
  hlsError?: string | null;
  remuxStatus?: 'NONE' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  remuxProgress?: number | null;
  remuxError?: string | null;
  hlsJobId: string | null;
  remuxJobId: string | null;
  actionJobId: string | null;
  originalSize: string | null;
  hlsSize: string | null;
  remuxSize: string | null;
  totalSize: string;
  retainOriginal: boolean;
  originalAvailable: boolean;
  errorMessage: string | null;
  missingVersions?: Array<'ORIGINAL' | 'REMUX' | 'HLS'>;
  createdAt: string;
  updatedAt: string;
  actions: { cancel: boolean; retry: boolean; publish: boolean; unpublish: boolean; deleteHls: boolean; deleteRemux: boolean; deleteOriginal: boolean };
};

@Injectable()
export class AdminMediaService {
  private readonly logger = new Logger(AdminMediaService.name);
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService, private readonly processing: VideoProcessingService) {}

  async list(query: AdminMediaQueryDto) {
    const [jobs, uploads, videoFiles] = await Promise.all([
      this.prisma.videoProcessingJob.findMany({ include: jobInclude, orderBy: { createdAt: 'desc' }, take: 500 }),
      this.prisma.resumableUpload.findMany({ where: { status: { in: [ResumableUploadStatus.INITIATED, ResumableUploadStatus.UPLOADING, ResumableUploadStatus.ASSEMBLING, ResumableUploadStatus.FAILED, ResumableUploadStatus.CANCELLED] } }, orderBy: { updatedAt: 'desc' }, take: 200 }),
      this.prisma.mediaFile.findMany({ where: { mediaType: 'VIDEO', status: { not: MediaStatus.DELETED } }, orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);
    const episodeIds = jobs.flatMap((job) => job.targetType === 'EPISODE' && job.targetId ? [job.targetId] : []);
    const movieIds = jobs.flatMap((job) => job.targetType === 'MOVIE' && job.targetId ? [job.targetId] : []);
    const [episodes, movies] = await Promise.all([
      this.prisma.episode.findMany({ where: { deletedAt: null, OR: [{ id: { in: episodeIds } }, { mediaFileId: { in: videoFiles.map((file) => file.id) } }] }, select: { id: true, mediaFileId: true, title: true, number: true, published: true, videoUrl: true, processedVideoUrl: true, originalVideoUrl: true, series: { select: { title: true } } } }),
      this.prisma.movie.findMany({ where: { id: { in: movieIds }, deletedAt: null }, select: { id: true, title: true, status: true, videoUrl: true, processedVideoUrl: true, originalVideoUrl: true } }),
    ]);
    const episodeMap = new Map(episodes.map((episode) => [episode.id, episode]));
    const episodeByMediaId = new Map(episodes.flatMap((episode) => episode.mediaFileId ? [[episode.mediaFileId, episode] as const] : []));
    const movieMap = new Map(movies.map((movie) => [movie.id, movie]));
    const usedMediaIds = new Set(jobs.flatMap((job) => [job.inputMediaFileId, job.outputMediaFileId].filter((id): id is string => Boolean(id))));
    const groupedJobs = new Map<string, MediaJob[]>();
    for (const job of jobs) groupedJobs.set(job.inputMediaFileId, [...(groupedJobs.get(job.inputMediaFileId) ?? []), job]);
    const items: AdminMediaItem[] = [
      ...[...groupedJobs.values()].map((group) => this.presentJob(group[0], episodeMap, movieMap, episodeByMediaId, group)),
      ...uploads.map((upload) => this.presentUpload(upload)),
      ...videoFiles.filter((file) => !usedMediaIds.has(file.id)).map((file) => this.presentFile(file, episodeByMediaId.get(file.id))),
    ];
    const filtered = items.filter((item) => this.matches(item, query));
    const direction = query.order === 'asc' ? 1 : -1;
    filtered.sort((left, right) => direction * this.compare(left, right, query.sort));
    const start = (query.page - 1) * query.limit;
    const pageItems = filtered.slice(start, start + query.limit);
    await Promise.all(pageItems.map(async (item) => {
      if (item.entity === 'UPLOAD') return;
      const versions = [['ORIGINAL', item.originalUrl], ['REMUX', item.remuxUrl], ['HLS', item.hlsUrl]] as const;
      item.missingVersions = (await Promise.all(versions.map(async ([label, url]) => {
        const key = url && typeof this.storage.keyFromUrl === 'function' ? this.storage.keyFromUrl(url) : null;
        return key && !await this.storage.exists(key) ? label : null;
      }))).filter((value): value is 'ORIGINAL' | 'REMUX' | 'HLS' => Boolean(value));
    }));
    return { items: pageItems, total: filtered.length, page: query.page, limit: query.limit, summary: this.summary(items) };
  }

  async listSelectable(search?: string) {
    const normalizedSearch = search?.trim();
    const files = await this.prisma.mediaFile.findMany({
      where: {
        mediaType: 'VIDEO',
        status: { not: MediaStatus.DELETED },
        outputJob: null,
        extension: { in: ['.mp4', '.mkv', '.mov', '.webm'] },
        originalName: normalizedSearch ? { contains: normalizedSearch, mode: 'insensitive' } : undefined,
      },
      include: { inputJobs: { include: { outputMediaFile: { select: { relativePath: true, status: true, extension: true, sizeBytes: true } } }, orderBy: { createdAt: 'desc' }, take: 10 } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(files.map(async (file) => {
      const active = file.inputJobs.find((job) => job.kind === 'HLS' && (job.status === 'QUEUED' || job.status === 'PROCESSING'));
      const completedCandidate = file.inputJobs.find((job) => job.kind === 'HLS' && job.status === 'COMPLETED' && Boolean(job.masterPath) && job.outputMediaFile?.status === MediaStatus.READY);
      const failedHls = file.inputJobs.find((job) => job.kind === 'HLS' && (job.status === 'FAILED' || job.status === 'CANCELLED'));
      const activeRemux = file.inputJobs.find((job) => job.kind === 'REMUX' && (job.status === 'QUEUED' || job.status === 'PROCESSING'));
      const completedRemuxCandidate = file.inputJobs.find((job) => job.kind === 'REMUX' && job.status === 'COMPLETED' && job.outputMediaFile?.status === MediaStatus.READY && job.outputMediaFile.extension.toLowerCase() === '.mp4' && job.outputMediaFile.sizeBytes > 0n);
      const failedRemux = file.inputJobs.find((job) => job.kind === 'REMUX' && (job.status === 'FAILED' || job.status === 'CANCELLED'));
      const [originalExists, hlsExists, remuxExists] = await Promise.all([
        file.sizeBytes > 0n ? this.storage.exists(file.relativePath) : Promise.resolve(false),
        completedCandidate?.masterPath ? this.storage.exists(completedCandidate.masterPath) : Promise.resolve(false),
        completedRemuxCandidate?.outputMediaFile ? this.storage.exists(completedRemuxCandidate.outputMediaFile.relativePath) : Promise.resolve(false),
      ]);
      const completed = hlsExists ? completedCandidate : undefined;
      const completedRemux = remuxExists ? completedRemuxCandidate : undefined;
      const latestHls = active ?? completed ?? failedHls;
      const status = active?.status ?? (completed ? 'READY' : failedHls ? 'FAILED' : 'ORIGINAL');
      const compatibility = directPlaybackCompatibility(file);
      const originalUrl = originalExists ? this.storage.publicUrl(file.relativePath) : null;
      const hlsUrl = completed?.masterPath ? this.storage.publicUrl(completed.masterPath) : null;
      return {
        id: file.id,
        originalName: file.originalName,
        sizeBytes: file.sizeBytes.toString(),
        durationSec: file.durationSec,
        width: file.width,
        height: file.height,
        videoCodec: file.videoCodec,
        audioCodec: file.audioCodec,
        mimeType: file.mimeType,
        extension: file.extension,
        status,
        progress: active?.progress ?? (completed ? 100 : null),
        processingJobId: latestHls?.id ?? null,
        processingError: failedHls?.errorMessage ?? null,
        originalUrl,
        hlsUrl,
        remuxUrl: completedRemux?.outputMediaFile ? this.storage.publicUrl(completedRemux.outputMediaFile.relativePath) : null,
        remuxJobId: activeRemux?.id ?? completedRemux?.id ?? failedRemux?.id ?? null,
        remuxStatus: activeRemux?.status ?? (completedRemux ? 'READY' : failedRemux ? 'FAILED' : 'NONE'),
        remuxProgress: activeRemux?.progress ?? (completedRemux ? 100 : null),
        remuxError: failedRemux?.errorMessage ?? null,
        playbackUrl: hlsUrl ?? (compatibility.compatible && originalExists ? originalUrl : null),
        directPlaybackCompatible: compatibility.compatible && originalExists,
        compatibilityMessage: originalExists ? compatibility.message : 'El archivo original falta en el almacenamiento.',
        fastStart: compatibility.fastStart,
        thumbnailUrl: completed?.thumbnailPath ? this.storage.publicUrl(completed.thumbnailPath) : null,
        createdAt: file.createdAt.toISOString(),
      };
    }));
  }

  transcode(mediaFileId: string, userId: string, options: EnqueueVideoProcessingDto) {
    return this.processing.enqueue(userId, mediaFileId, { ...options, retainOriginal: true });
  }

  remux(mediaFileId: string, userId: string, options: EnqueueVideoProcessingDto) {
    return this.processing.enqueueRemux(userId, mediaFileId, { ...options, retainOriginal: true });
  }

  async deleteRemux(id: string) {
    const job = await this.findJob(id);
    if (job.kind !== 'REMUX' || !job.outputMediaFile) throw new ConflictException('El trabajo no tiene una salida MP4 remux');
    const url = this.storage.publicUrl(job.outputMediaFile.relativePath);
    const active = await this.prisma.episode.count({ where: { deletedAt: null, playbackMode: 'REMUX', OR: [{ videoUrl: url }, { remuxedVideoUrl: url }] } });
    if (active) throw new ConflictException('No se puede eliminar el MP4 remux porque es la fuente activa de un episodio');
    await this.prisma.videoProcessingJob.update({ where: { id }, data: { processingStage: 'DELETING_REMUX', errorMessage: null } });
    try {
      await this.storage.delete(job.outputMediaFile.relativePath);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 400) : 'Error desconocido de almacenamiento';
      await this.prisma.videoProcessingJob.update({ where: { id }, data: { processingStage: 'REMUX_DELETE_FAILED', errorMessage: `No se pudo eliminar REMUX: ${message}` } });
      this.logger.error(`remux_delete_failed job=${id}: ${message}`);
      throw new InternalServerErrorException('No se pudo eliminar el MP4 remux; la version sigue registrada y la operacion puede reintentarse.');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.episode.updateMany({ where: { deletedAt: null, remuxedVideoUrl: url }, data: { remuxedVideoUrl: null } }),
        this.prisma.mediaFile.update({ where: { id: job.outputMediaFile.id }, data: { status: MediaStatus.DELETED } }),
        this.prisma.videoProcessingJob.update({ where: { id }, data: { outputMediaFileId: null, status: 'CANCELLED', processingStage: 'REMUX_DELETED', progress: 0, associatedAt: null, errorMessage: 'Salida MP4 remux eliminada por un administrador' } }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 400) : 'Error desconocido de base de datos';
      await this.prisma.videoProcessingJob.update({ where: { id }, data: { processingStage: 'REMUX_RECONCILE_REQUIRED', errorMessage: `REMUX eliminado; reconciliacion pendiente: ${message}` } }).catch(() => undefined);
      this.logger.error(`remux_reconcile_required job=${id}: ${message}`);
      throw new InternalServerErrorException('El MP4 remux se elimino, pero la base de datos requiere reconciliacion.');
    }
    return { removed: true, releasedBytes: job.outputMediaFile.sizeBytes.toString(), originalPreserved: true };
  }

  async get(id: string) {
    if (id.startsWith('upload:')) {
      const upload = await this.prisma.resumableUpload.findUnique({ where: { id: id.slice(7) } });
      if (!upload) throw new NotFoundException('Carga multimedia no encontrada');
      return this.presentUpload(upload);
    }
    if (id.startsWith('file:')) {
      const file = await this.prisma.mediaFile.findUnique({ where: { id: id.slice(5) } });
      if (!file || file.mediaType !== 'VIDEO') throw new NotFoundException('Archivo multimedia no encontrado');
      return this.presentFile(file);
    }
    const job = await this.findJob(id);
    const [episodes, movies] = await Promise.all([
      job.targetType === 'EPISODE' && job.targetId ? this.prisma.episode.findMany({ where: { id: job.targetId }, select: { id: true, title: true, number: true, published: true, videoUrl: true, processedVideoUrl: true, originalVideoUrl: true, series: { select: { title: true } } } }) : Promise.resolve([]),
      job.targetType === 'MOVIE' && job.targetId ? this.prisma.movie.findMany({ where: { id: job.targetId }, select: { id: true, title: true, status: true, videoUrl: true, processedVideoUrl: true, originalVideoUrl: true } }) : Promise.resolve([]),
    ]);
    const siblings = await this.prisma.videoProcessingJob.findMany({ where: { inputMediaFileId: job.inputMediaFileId }, include: jobInclude, orderBy: { createdAt: 'desc' } });
    return this.presentJob(job, new Map(episodes.map((item) => [item.id, item])), new Map(movies.map((item) => [item.id, item])), new Map(), siblings);
  }

  cancel(id: string) { this.assertJobId(id); return this.processing.cancel(id); }
  retry(id: string) { this.assertJobId(id); return this.processing.retry(id); }

  async publish(id: string, adminId: string) {
    let job = await this.findJob(id);
    if (job.status !== 'COMPLETED' || !job.masterPath || !job.targetType || !job.targetId) throw new ConflictException('Solo se puede publicar un HLS completado y asociado a contenido');
    if (!await this.storage.exists(this.hlsMasterKey(job))) throw new ConflictException('El manifiesto HLS no esta disponible en el almacenamiento');
    if (!job.associatedAt) {
      await this.processing.associateAsAdmin(id, { targetType: job.targetType, targetId: job.targetId }, adminId);
      job = await this.findJob(id);
    }
    if (job.targetType === VideoProcessingTargetType.EPISODE) await this.prisma.episode.update({ where: { id: job.targetId! }, data: { published: true } });
    else await this.prisma.movie.update({ where: { id: job.targetId! }, data: { status: 'PUBLISHED' } });
    return this.get(id);
  }

  async unpublish(id: string) {
    const job = await this.findJob(id);
    if (!job.targetType || !job.targetId) throw new ConflictException('El archivo no esta asociado a contenido');
    if (job.targetType === VideoProcessingTargetType.EPISODE) await this.prisma.episode.update({ where: { id: job.targetId }, data: { published: false } });
    else await this.prisma.movie.update({ where: { id: job.targetId }, data: { status: 'DRAFT' } });
    return this.get(id);
  }

  async deleteHls(id: string) {
    const job = await this.findJob(id);
    if (job.kind && job.kind !== 'HLS') throw new ConflictException('El trabajo no tiene una salida HLS');
    const masterKey = this.hlsMasterKey(job);
    const publicUrl = this.storage.publicUrl(masterKey);
    const [active, movieReferences] = await Promise.all([
      this.prisma.episode.count({ where: { deletedAt: null, playbackMode: 'HLS', OR: [{ videoUrl: publicUrl }, { processedVideoUrl: publicUrl }] } }),
      this.prisma.movie.count({ where: { deletedAt: null, OR: [{ videoUrl: publicUrl }, { processedVideoUrl: publicUrl }] } }),
    ]);
    if (active || movieReferences) throw new ConflictException('No se puede eliminar HLS porque es la fuente activa de otro contenido');
    const releasedBytes = job.outputMediaFile?.sizeBytes ?? 0n;
    await this.prisma.$transaction(async (tx) => {
      await tx.episode.updateMany({ where: { deletedAt: null, playbackMode: { not: 'HLS' }, processedVideoUrl: publicUrl }, data: { processedVideoUrl: null } });
      await tx.videoProcessingJob.update({ where: { id }, data: { processingStage: 'DELETING_HLS', errorMessage: null } });
    });
    try {
      await this.storage.deletePrefix(`hls/${job.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 400) : 'Error desconocido de almacenamiento';
      await this.prisma.videoProcessingJob.update({ where: { id }, data: { processingStage: 'HLS_DELETE_FAILED', errorMessage: `No se pudo eliminar HLS: ${message}` } });
      this.logger.error(`hls_delete_failed job=${id}: ${message}`);
      throw new InternalServerErrorException('No se pudo eliminar el HLS. El contenido quedo despublicado y la operacion puede reintentarse.');
    }
    try {
      await this.prisma.$transaction([
        ...(job.outputMediaFileId ? [this.prisma.mediaFile.update({ where: { id: job.outputMediaFileId }, data: { status: MediaStatus.DELETED } })] : []),
        this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'CANCELLED', processingStage: 'HLS_DELETED', progress: 0, masterPath: null, outputMediaFileId: null, generatedQualities: [], associatedAt: null, errorMessage: 'Salida HLS eliminada por un administrador' } }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 400) : 'Error desconocido de base de datos';
      await this.prisma.videoProcessingJob.update({ where: { id }, data: { processingStage: 'HLS_RECONCILE_REQUIRED', errorMessage: `HLS eliminado; reconciliacion pendiente: ${message}` } }).catch(() => undefined);
      this.logger.error(`hls_reconcile_required job=${id}: ${message}`);
      throw new InternalServerErrorException('El HLS se elimino, pero la base de datos requiere reconciliacion. El contenido permanece despublicado.');
    }
    return { removed: true, releasedBytes: releasedBytes.toString(), originalPreserved: true };
  }

  async deleteOriginal(id: string) {
    const job = await this.findJob(id);
    if (job.retainOriginal) throw new ConflictException('El original esta marcado para conservarse');
    if (['QUEUED', 'PROCESSING'].includes(job.status)) throw new ConflictException('No se puede eliminar el original durante el procesamiento');
    if (job.inputMediaFile.status === MediaStatus.DELETED) throw new ConflictException('El original ya fue eliminado');
    const originalUrl = this.storage.publicUrl(job.inputMediaFile.relativePath);
    const [episodeReferences, movieReferences] = await Promise.all([
      this.prisma.episode.count({ where: { deletedAt: null, OR: [{ mediaFileId: job.inputMediaFileId }, { originalVideoUrl: originalUrl }] } }),
      this.prisma.movie.count({ where: { deletedAt: null, originalVideoUrl: originalUrl } }),
    ]);
    const activeOriginal = await this.prisma.episode.count({ where: { deletedAt: null, playbackMode: 'ORIGINAL', OR: [{ mediaFileId: job.inputMediaFileId }, { originalVideoUrl: originalUrl }] } });
    if (activeOriginal) throw new ConflictException('No se puede eliminar el original porque es la fuente activa de un episodio');
    if (episodeReferences + movieReferences > 1) throw new ConflictException('El original esta compartido por varios contenidos y no se puede eliminar');
    await this.prisma.$transaction(async (tx) => {
      if (job.targetType === 'EPISODE' && job.targetId) await tx.episode.updateMany({ where: { id: job.targetId, originalVideoUrl: originalUrl }, data: { originalVideoUrl: null } });
      if (job.targetType === 'MOVIE' && job.targetId) await tx.movie.updateMany({ where: { id: job.targetId, originalVideoUrl: originalUrl }, data: { originalVideoUrl: null } });
    });
    await this.storage.delete(job.inputMediaFile.relativePath);
    await this.prisma.mediaFile.update({ where: { id: job.inputMediaFileId }, data: { status: MediaStatus.DELETED } });
    return { removed: true };
  }

  async deleteAsset(mediaFileId: string) {
    if (!/^[a-z0-9]+$/i.test(mediaFileId)) throw new NotFoundException('Activo multimedia no encontrado');
    const file = await this.prisma.mediaFile.findFirst({ where: { id: mediaFileId, mediaType: 'VIDEO', outputJob: null }, include: { inputJobs: { include: { outputMediaFile: true } } } });
    if (!file) throw new NotFoundException('Activo multimedia no encontrado');
    if (file.inputJobs.some((job) => ['QUEUED', 'PROCESSING'].includes(job.status))) throw new ConflictException('No se puede eliminar el activo mientras tiene procesamiento pendiente');
    const associations = await this.prisma.episode.count({ where: { deletedAt: null, mediaFileId } });
    if (associations) throw new ConflictException('No se puede eliminar el activo porque esta asociado a uno o mas episodios');
    for (const job of file.inputJobs) {
      if (job.kind === 'HLS' && job.masterPath) {
        if (job.masterPath !== `hls/${job.id}/master.m3u8`) throw new ConflictException('El activo contiene una ruta HLS no administrada');
        await this.storage.deletePrefix(`hls/${job.id}`);
      }
      if (job.kind === 'REMUX' && job.outputMediaFile) {
        if (job.outputMediaFile.relativePath !== `videos/remux-${job.id}.mp4`) throw new ConflictException('El activo contiene una ruta remux no administrada');
        await this.storage.delete(job.outputMediaFile.relativePath);
      }
    }
    await this.storage.delete(file.relativePath);
    await this.prisma.$transaction(async (tx) => {
      for (const job of file.inputJobs) {
        if (job.outputMediaFileId) await tx.mediaFile.update({ where: { id: job.outputMediaFileId }, data: { status: MediaStatus.DELETED } });
        await tx.videoProcessingJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', processingStage: 'ASSET_DELETED', outputMediaFileId: null, masterPath: null, associatedAt: null } });
      }
      await tx.mediaFile.update({ where: { id: mediaFileId }, data: { status: MediaStatus.DELETED } });
    });
    return { removed: true };
  }

  private async findJob(id: string) {
    this.assertJobId(id);
    const job = await this.prisma.videoProcessingJob.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw new NotFoundException('Elemento multimedia no encontrado');
    return job;
  }

  private assertJobId(id: string) { if (!/^[a-z0-9]+$/i.test(id)) throw new NotFoundException('Elemento multimedia no encontrado'); }
  private hlsMasterKey(job: MediaJob) {
    const expected = `hls/${job.id}/master.m3u8`;
    if (job.masterPath !== expected) throw new ConflictException('La salida HLS no usa una ruta administrada valida');
    return expected;
  }

  private presentJob(job: MediaJob, episodes: Map<string, { id: string; title: string; number: number; published: boolean; series: { title: string } }>, movies: Map<string, { id: string; title: string; status: string }>, episodesByMedia = new Map<string, { id: string; title: string; number: number; published: boolean; series: { title: string } }>(), siblings: MediaJob[] = [job]): AdminMediaItem {
    const hlsCompleted = siblings.find((item) => item.kind === 'HLS' && item.status === 'COMPLETED' && Boolean(item.masterPath) && item.outputMediaFile?.status === MediaStatus.READY);
    const remuxCompleted = siblings.find((item) => item.kind === 'REMUX' && item.status === 'COMPLETED' && item.outputMediaFile?.status === MediaStatus.READY);
    const hlsJob = siblings.find((item) => item.kind === 'HLS' && ['QUEUED', 'PROCESSING'].includes(item.status)) ?? hlsCompleted ?? siblings.find((item) => item.kind === 'HLS' && ['FAILED', 'CANCELLED'].includes(item.status)) ?? siblings.find((item) => item.kind === 'HLS');
    const remuxJob = siblings.find((item) => item.kind === 'REMUX' && ['QUEUED', 'PROCESSING'].includes(item.status)) ?? remuxCompleted ?? siblings.find((item) => item.kind === 'REMUX' && ['FAILED', 'CANCELLED'].includes(item.status)) ?? siblings.find((item) => item.kind === 'REMUX');
    job = siblings.find((item) => ['QUEUED', 'PROCESSING'].includes(item.status)) ?? siblings.find((item) => item.status === 'FAILED') ?? hlsJob ?? remuxJob ?? job;
    const episode = job.targetType === 'EPISODE' && job.targetId ? episodes.get(job.targetId) : episodesByMedia.get(job.inputMediaFileId);
    const movie = job.targetType === 'MOVIE' && job.targetId ? movies.get(job.targetId) : undefined;
    const contentType: MediaContentType = episode ? 'EPISODE' : movie ? 'MOVIE' : 'UNASSIGNED';
    const published = episode?.published ?? movie?.status === 'PUBLISHED';
    const status = job.status as Exclude<MediaItemStatus, 'UPLOADING' | 'UNASSIGNED'>;
    const originalSize = job.inputMediaFile.sizeBytes;
    const hlsSize = hlsCompleted?.outputMediaFile?.sizeBytes ?? null;
    const remuxSize = remuxCompleted?.outputMediaFile?.sizeBytes ?? null;
    const canPublish = Boolean(hlsCompleted && contentType !== 'UNASSIGNED' && hlsCompleted.masterPath && hlsCompleted.targetId);
    return {
      id: job.id, entity: 'JOB', contentType, contentId: job.targetId, mediaFileId: job.inputMediaFileId, title: episode ? `${episode.series.title} · E${episode.number} ${episode.title}` : movie?.title ?? 'Sin contenido asignado', contentUrl: episode ? '/admin/episodes' : movie ? '/admin/movies' : null,
      originalName: job.inputMediaFile.originalName, extension: job.inputMediaFile.extension, status, stage: job.processingStage, progress: job.progress, resolution: job.sourceWidth && job.sourceHeight ? `${job.sourceWidth}x${job.sourceHeight}` : null, qualities: job.generatedQualities,
      published, originalUrl: this.storage.publicUrl(job.inputMediaFile.relativePath), hlsUrl: hlsCompleted?.masterPath ? this.storage.publicUrl(hlsCompleted.masterPath) : null, remuxUrl: remuxCompleted?.outputMediaFile ? this.storage.publicUrl(remuxCompleted.outputMediaFile.relativePath) : null,
      hlsStatus: this.variantStatus(hlsJob, hlsCompleted), hlsProgress: hlsJob?.progress ?? null, hlsError: hlsJob && ['FAILED', 'CANCELLED'].includes(hlsJob.status) ? hlsJob.errorMessage : null,
      remuxStatus: this.variantStatus(remuxJob, remuxCompleted), remuxProgress: remuxJob?.progress ?? null, remuxError: remuxJob && ['FAILED', 'CANCELLED'].includes(remuxJob.status) ? remuxJob.errorMessage : null,
      hlsJobId: hlsCompleted?.id ?? hlsJob?.id ?? null, remuxJobId: remuxCompleted?.id ?? remuxJob?.id ?? null, actionJobId: job.id, originalSize: originalSize.toString(), hlsSize: hlsSize?.toString() ?? null, remuxSize: remuxSize?.toString() ?? null, totalSize: (originalSize + (hlsSize ?? 0n) + (remuxSize ?? 0n)).toString(), retainOriginal: siblings.every((item) => item.retainOriginal), originalAvailable: job.inputMediaFile.status !== MediaStatus.DELETED,
      errorMessage: job.errorMessage, missingVersions: [], createdAt: siblings.at(-1)?.createdAt.toISOString() ?? job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(), actions: { cancel: ['QUEUED', 'PROCESSING'].includes(status), retry: ['FAILED', 'CANCELLED'].includes(status) && job.inputMediaFile.status !== MediaStatus.DELETED, publish: canPublish && !published, unpublish: Boolean(job.targetId && published), deleteHls: Boolean(hlsCompleted?.masterPath), deleteRemux: Boolean(remuxCompleted?.outputMediaFile), deleteOriginal: job.inputMediaFile.status !== MediaStatus.DELETED && !siblings.some((item) => ['QUEUED', 'PROCESSING'].includes(item.status)) },
    };
  }

  private variantStatus(job?: MediaJob, completed?: MediaJob): 'NONE' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' {
    if (completed) return 'READY';
    if (job?.status === 'QUEUED' || job?.status === 'PROCESSING') return job.status;
    if (job?.status === 'FAILED' || job?.status === 'CANCELLED') return 'FAILED';
    return 'NONE';
  }

  private presentUpload(upload: { id: string; originalName: string; sizeBytes: bigint; uploadedParts: number[]; totalChunks: number; status: ResumableUploadStatus; errorMessage: string | null; createdAt: Date; updatedAt: Date }): AdminMediaItem {
    const progress = upload.totalChunks ? Math.round(upload.uploadedParts.length / upload.totalChunks * 100) : 0;
    const status: MediaItemStatus = upload.status === 'FAILED' ? 'FAILED' : upload.status === 'CANCELLED' ? 'CANCELLED' : 'UPLOADING';
    return { id: `upload:${upload.id}`, entity: 'UPLOAD', contentType: 'UPLOAD', contentId: null, title: 'Carga en curso', contentUrl: null, originalName: upload.originalName, status, stage: upload.status, progress, resolution: null, qualities: [], published: false, hlsUrl: null, remuxUrl: null, hlsJobId: null, remuxJobId: null, actionJobId: null, originalSize: upload.sizeBytes.toString(), hlsSize: null, remuxSize: null, totalSize: upload.sizeBytes.toString(), retainOriginal: true, originalAvailable: true, errorMessage: upload.errorMessage, createdAt: upload.createdAt.toISOString(), updatedAt: upload.updatedAt.toISOString(), actions: { cancel: false, retry: false, publish: false, unpublish: false, deleteHls: false, deleteRemux: false, deleteOriginal: false } };
  }

  private presentFile(file: { id: string; originalName: string; relativePath: string; extension: string; sizeBytes: bigint; status: MediaStatus; width: number | null; height: number | null; createdAt: Date; updatedAt: Date; errorMessage: string | null }, episode?: { id: string; title: string; number: number; published: boolean; series: { title: string } }): AdminMediaItem {
    return { id: `file:${file.id}`, entity: 'FILE', contentType: episode ? 'EPISODE' : 'UNASSIGNED', contentId: episode?.id ?? null, mediaFileId: file.id, title: episode ? `${episode.series.title} · E${episode.number} ${episode.title}` : 'Archivo sin asignar', contentUrl: episode ? '/admin/episodes' : null, originalName: file.originalName, extension: file.extension, status: episode ? 'ORIGINAL' : 'UNASSIGNED', stage: episode ? 'ORIGINAL' : file.status, progress: null, resolution: file.width && file.height ? `${file.width}x${file.height}` : null, qualities: [], published: episode?.published ?? false, originalUrl: this.storage.publicUrl(file.relativePath), hlsUrl: null, remuxUrl: null, hlsJobId: null, remuxJobId: null, actionJobId: null, originalSize: file.sizeBytes.toString(), hlsSize: null, remuxSize: null, totalSize: file.sizeBytes.toString(), retainOriginal: true, originalAvailable: true, errorMessage: file.errorMessage, createdAt: file.createdAt.toISOString(), updatedAt: file.updatedAt.toISOString(), actions: { cancel: false, retry: false, publish: false, unpublish: false, deleteHls: false, deleteRemux: false, deleteOriginal: false } };
  }

  private matches(item: AdminMediaItem, query: AdminMediaQueryDto) {
    const search = query.search?.trim().toLocaleLowerCase();
    if (search && !`${item.title} ${item.originalName ?? ''}`.toLocaleLowerCase().includes(search)) return false;
    if (query.contentType !== 'ALL' && item.contentType !== query.contentType) return false;
    if (query.status !== 'ALL' && item.status !== query.status) return false;
    if (query.publication === 'PUBLISHED' && !item.published) return false;
    if (query.publication === 'DRAFT' && item.published) return false;
    if (query.variant === 'ORIGINAL' && !item.originalAvailable) return false;
    if (query.variant === 'MP4' && item.extension !== '.mp4') return false;
    if (query.variant === 'MKV' && item.extension !== '.mkv') return false;
    if (query.variant === 'HLS' && !item.hlsUrl) return false;
    if (query.variant === 'REMUX' && !item.remuxUrl) return false;
    if (query.variant === 'PROCESSING' && !['UPLOADING', 'QUEUED', 'PROCESSING'].includes(item.status)) return false;
    if (query.variant === 'ERRORS' && item.status !== 'FAILED' && !item.errorMessage) return false;
    if (query.variant === 'UNUSED' && item.contentType !== 'UNASSIGNED') return false;
    return true;
  }

  private compare(left: AdminMediaItem, right: AdminMediaItem, sort: AdminMediaQueryDto['sort']) {
    if (sort === 'title') return left.title.localeCompare(right.title);
    if (sort === 'size') return Number(BigInt(left.totalSize) - BigInt(right.totalSize));
    if (sort === 'progress') return (left.progress ?? -1) - (right.progress ?? -1);
    return Date.parse(left[sort]) - Date.parse(right[sort]);
  }

  private summary(items: AdminMediaItem[]) {
    const sum = (field: 'originalSize' | 'remuxSize' | 'hlsSize') => items.reduce((total, item) => total + BigInt(item[field] ?? 0), 0n).toString();
    return { active: items.filter((item) => ['UPLOADING', 'QUEUED', 'PROCESSING'].includes(item.status)).length, completed: items.filter((item) => item.status === 'COMPLETED').length, failed: items.filter((item) => item.status === 'FAILED').length, cancelled: items.filter((item) => item.status === 'CANCELLED').length, unassigned: items.filter((item) => item.contentType === 'UNASSIGNED').length, published: items.filter((item) => item.published).length, drafts: items.filter((item) => item.contentId && !item.published).length, originalBytes: sum('originalSize'), remuxBytes: sum('remuxSize'), hlsBytes: sum('hlsSize'), totalBytes: items.reduce((total, item) => total + BigInt(item.totalSize), 0n).toString() };
  }
}
