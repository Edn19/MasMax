import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MediaStatus, Prisma, ResumableUploadStatus, VideoProcessingTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { AdminMediaQueryDto } from './admin-media.dto';
import { VideoProcessingService } from './video-processing.service';

const jobInclude = {
  inputMediaFile: { select: { id: true, originalName: true, relativePath: true, sizeBytes: true, status: true, width: true, height: true } },
  outputMediaFile: { select: { id: true, relativePath: true, sizeBytes: true, status: true } },
} as const;

type MediaJob = Prisma.VideoProcessingJobGetPayload<{ include: typeof jobInclude }>;
type MediaContentType = 'EPISODE' | 'MOVIE' | 'UNASSIGNED' | 'UPLOAD';
type MediaItemStatus = 'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNASSIGNED';

export type AdminMediaItem = {
  id: string;
  entity: 'JOB' | 'UPLOAD' | 'FILE';
  contentType: MediaContentType;
  contentId: string | null;
  title: string;
  contentUrl: string | null;
  originalName: string | null;
  status: MediaItemStatus;
  stage: string | null;
  progress: number | null;
  resolution: string | null;
  qualities: number[];
  published: boolean;
  hlsUrl: string | null;
  originalSize: string | null;
  hlsSize: string | null;
  totalSize: string;
  retainOriginal: boolean;
  originalAvailable: boolean;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  actions: { cancel: boolean; retry: boolean; publish: boolean; unpublish: boolean; deleteHls: boolean; deleteOriginal: boolean };
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
      this.prisma.episode.findMany({ where: { id: { in: episodeIds }, deletedAt: null }, select: { id: true, title: true, number: true, published: true, videoUrl: true, processedVideoUrl: true, originalVideoUrl: true, series: { select: { title: true } } } }),
      this.prisma.movie.findMany({ where: { id: { in: movieIds }, deletedAt: null }, select: { id: true, title: true, status: true, videoUrl: true, processedVideoUrl: true, originalVideoUrl: true } }),
    ]);
    const episodeMap = new Map(episodes.map((episode) => [episode.id, episode]));
    const movieMap = new Map(movies.map((movie) => [movie.id, movie]));
    const usedMediaIds = new Set(jobs.flatMap((job) => [job.inputMediaFileId, job.outputMediaFileId].filter((id): id is string => Boolean(id))));
    const items: AdminMediaItem[] = [
      ...jobs.map((job) => this.presentJob(job, episodeMap, movieMap)),
      ...uploads.map((upload) => this.presentUpload(upload)),
      ...videoFiles.filter((file) => !usedMediaIds.has(file.id)).map((file) => this.presentFile(file)),
    ];
    const filtered = items.filter((item) => this.matches(item, query));
    const direction = query.order === 'asc' ? 1 : -1;
    filtered.sort((left, right) => direction * this.compare(left, right, query.sort));
    const start = (query.page - 1) * query.limit;
    return { items: filtered.slice(start, start + query.limit), total: filtered.length, page: query.page, limit: query.limit, summary: this.summary(items) };
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
    return this.presentJob(job, new Map(episodes.map((item) => [item.id, item])), new Map(movies.map((item) => [item.id, item])));
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
    const masterKey = this.hlsMasterKey(job);
    const publicUrl = this.storage.publicUrl(masterKey);
    const releasedBytes = job.outputMediaFile?.sizeBytes ?? 0n;
    await this.prisma.$transaction(async (tx) => {
      if (job.targetType === 'EPISODE' && job.targetId) {
        await tx.episode.updateMany({ where: { id: job.targetId, videoUrl: publicUrl }, data: { videoUrl: null } });
        await tx.episode.updateMany({ where: { id: job.targetId }, data: { published: false, processedVideoUrl: null } });
      }
      if (job.targetType === 'MOVIE' && job.targetId) {
        await tx.movie.updateMany({ where: { id: job.targetId, videoUrl: publicUrl }, data: { videoUrl: '' } });
        await tx.movie.updateMany({ where: { id: job.targetId }, data: { status: 'DRAFT', processedVideoUrl: null } });
      }
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
    await this.prisma.$transaction(async (tx) => {
      const originalUrl = this.storage.publicUrl(job.inputMediaFile.relativePath);
      if (job.targetType === 'EPISODE' && job.targetId) await tx.episode.updateMany({ where: { id: job.targetId, originalVideoUrl: originalUrl }, data: { originalVideoUrl: null } });
      if (job.targetType === 'MOVIE' && job.targetId) await tx.movie.updateMany({ where: { id: job.targetId, originalVideoUrl: originalUrl }, data: { originalVideoUrl: null } });
    });
    await this.storage.delete(job.inputMediaFile.relativePath);
    await this.prisma.mediaFile.update({ where: { id: job.inputMediaFileId }, data: { status: MediaStatus.DELETED } });
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

  private presentJob(job: MediaJob, episodes: Map<string, { id: string; title: string; number: number; published: boolean; series: { title: string } }>, movies: Map<string, { id: string; title: string; status: string }>): AdminMediaItem {
    const episode = job.targetType === 'EPISODE' && job.targetId ? episodes.get(job.targetId) : undefined;
    const movie = job.targetType === 'MOVIE' && job.targetId ? movies.get(job.targetId) : undefined;
    const contentType: MediaContentType = episode ? 'EPISODE' : movie ? 'MOVIE' : 'UNASSIGNED';
    const published = episode?.published ?? movie?.status === 'PUBLISHED';
    const status = job.status as Exclude<MediaItemStatus, 'UPLOADING' | 'UNASSIGNED'>;
    const originalSize = job.inputMediaFile.sizeBytes;
    const hlsSize = job.outputMediaFile?.sizeBytes ?? null;
    const canPublish = status === 'COMPLETED' && contentType !== 'UNASSIGNED' && Boolean(job.masterPath && job.targetId);
    return {
      id: job.id, entity: 'JOB', contentType, contentId: job.targetId, title: episode ? `${episode.series.title} · E${episode.number} ${episode.title}` : movie?.title ?? 'Sin contenido asignado', contentUrl: episode ? '/admin/episodes' : movie ? '/admin/movies' : null,
      originalName: job.inputMediaFile.originalName, status, stage: job.processingStage, progress: job.progress, resolution: job.sourceWidth && job.sourceHeight ? `${job.sourceWidth}x${job.sourceHeight}` : null, qualities: job.generatedQualities,
      published, hlsUrl: job.masterPath ? this.storage.publicUrl(job.masterPath) : null, originalSize: originalSize.toString(), hlsSize: hlsSize?.toString() ?? null, totalSize: (originalSize + (hlsSize ?? 0n)).toString(), retainOriginal: job.retainOriginal, originalAvailable: job.inputMediaFile.status !== MediaStatus.DELETED,
      errorMessage: job.errorMessage, createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(), actions: { cancel: ['QUEUED', 'PROCESSING'].includes(status), retry: ['FAILED', 'CANCELLED'].includes(status) && job.inputMediaFile.status !== MediaStatus.DELETED, publish: canPublish && !published, unpublish: Boolean(job.targetId && published), deleteHls: Boolean(job.masterPath), deleteOriginal: !job.retainOriginal && job.inputMediaFile.status !== MediaStatus.DELETED && !['QUEUED', 'PROCESSING'].includes(status) },
    };
  }

  private presentUpload(upload: { id: string; originalName: string; sizeBytes: bigint; uploadedParts: number[]; totalChunks: number; status: ResumableUploadStatus; errorMessage: string | null; createdAt: Date; updatedAt: Date }): AdminMediaItem {
    const progress = upload.totalChunks ? Math.round(upload.uploadedParts.length / upload.totalChunks * 100) : 0;
    const status: MediaItemStatus = upload.status === 'FAILED' ? 'FAILED' : upload.status === 'CANCELLED' ? 'CANCELLED' : 'UPLOADING';
    return { id: `upload:${upload.id}`, entity: 'UPLOAD', contentType: 'UPLOAD', contentId: null, title: 'Carga en curso', contentUrl: null, originalName: upload.originalName, status, stage: upload.status, progress, resolution: null, qualities: [], published: false, hlsUrl: null, originalSize: upload.sizeBytes.toString(), hlsSize: null, totalSize: upload.sizeBytes.toString(), retainOriginal: true, originalAvailable: true, errorMessage: upload.errorMessage, createdAt: upload.createdAt.toISOString(), updatedAt: upload.updatedAt.toISOString(), actions: { cancel: false, retry: false, publish: false, unpublish: false, deleteHls: false, deleteOriginal: false } };
  }

  private presentFile(file: { id: string; originalName: string; sizeBytes: bigint; status: MediaStatus; width: number | null; height: number | null; createdAt: Date; updatedAt: Date; errorMessage: string | null }): AdminMediaItem {
    return { id: `file:${file.id}`, entity: 'FILE', contentType: 'UNASSIGNED', contentId: null, title: 'Archivo sin asignar', contentUrl: null, originalName: file.originalName, status: 'UNASSIGNED', stage: file.status, progress: null, resolution: file.width && file.height ? `${file.width}x${file.height}` : null, qualities: [], published: false, hlsUrl: null, originalSize: file.sizeBytes.toString(), hlsSize: null, totalSize: file.sizeBytes.toString(), retainOriginal: true, originalAvailable: true, errorMessage: file.errorMessage, createdAt: file.createdAt.toISOString(), updatedAt: file.updatedAt.toISOString(), actions: { cancel: false, retry: false, publish: false, unpublish: false, deleteHls: false, deleteOriginal: false } };
  }

  private matches(item: AdminMediaItem, query: AdminMediaQueryDto) {
    const search = query.search?.trim().toLocaleLowerCase();
    if (search && !`${item.title} ${item.originalName ?? ''}`.toLocaleLowerCase().includes(search)) return false;
    if (query.contentType !== 'ALL' && item.contentType !== query.contentType) return false;
    if (query.status !== 'ALL' && item.status !== query.status) return false;
    if (query.publication === 'PUBLISHED' && !item.published) return false;
    if (query.publication === 'DRAFT' && item.published) return false;
    return true;
  }

  private compare(left: AdminMediaItem, right: AdminMediaItem, sort: AdminMediaQueryDto['sort']) {
    if (sort === 'title') return left.title.localeCompare(right.title);
    if (sort === 'size') return Number(BigInt(left.totalSize) - BigInt(right.totalSize));
    if (sort === 'progress') return (left.progress ?? -1) - (right.progress ?? -1);
    return Date.parse(left[sort]) - Date.parse(right[sort]);
  }

  private summary(items: AdminMediaItem[]) {
    return { active: items.filter((item) => ['UPLOADING', 'QUEUED', 'PROCESSING'].includes(item.status)).length, completed: items.filter((item) => item.status === 'COMPLETED').length, failed: items.filter((item) => item.status === 'FAILED').length, cancelled: items.filter((item) => item.status === 'CANCELLED').length, unassigned: items.filter((item) => item.contentType === 'UNASSIGNED').length, published: items.filter((item) => item.published).length, drafts: items.filter((item) => item.contentId && !item.published).length };
  }
}
