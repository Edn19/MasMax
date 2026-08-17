import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { EpisodePlaybackMode, MediaStatus, Prisma, VideoProcessingStatus, VideoProcessingTargetType, VideoSource, VideoType } from '@prisma/client';
import { NormalizedVideo, normalizeVideo } from '../common/video';
import { validatePlaybackMarkers } from '../common/playback-markers';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { BulkCreateEpisodesDto, CopyEpisodeSettingsDto, CreateEpisodeDto, PublishEpisodesDto, QueryAdminEpisodesDto, ReorderEpisodesDto, UpdateEpisodeDto } from './dto';
import { toCatalogResponse } from '../common/catalog-response';
import { publishedEpisodeWhere, publishedSeriesWhere } from '../common/content-visibility';
import { directPlaybackCompatibility } from '../video-processing/direct-playback';

type LinkableVideoJob = Prisma.VideoProcessingJobGetPayload<{ include: { inputMediaFile: true; outputMediaFile: true } }>;
type LinkableMedia = Prisma.MediaFileGetPayload<{ include: { inputJobs: { include: { outputMediaFile: true } } } }>;
type EpisodeJobSummary = Prisma.VideoProcessingJobGetPayload<{ include: { inputMediaFile: { select: { originalName: true } } } }>;

export function findMissingEpisodeNumbers(numbers: number[]) {
  const valid = [...new Set(numbers.filter((number) => Number.isInteger(number) && number > 0))].sort((left, right) => left - right);
  const max = valid.at(-1) ?? 0;
  const present = new Set(valid);
  return { max, missing: Array.from({ length: max }, (_, index) => index + 1).filter((number) => !present.has(number)) };
}

@Injectable()
export class EpisodesService {
  private readonly logger = new Logger(EpisodesService.name);

  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService) {}

  latest() {
    return this.prisma.episode.findMany({
      where: publishedEpisodeWhere(),
      include: { season: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] }, series: { include: { genres: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 24,
    }).then(toCatalogResponse);
  }

  async adminList(query: QueryAdminEpisodesDto) {
    const numericSearch = query.search && /^\d+$/.test(query.search) ? Number(query.search) : null;
    const where: Prisma.EpisodeWhereInput = {
      deletedAt: null,
      seriesId: query.seriesId,
      seasonId: query.seasonId,
      published: query.published,
      videoUrl: query.videoState === 'READY' ? { not: null } : query.videoState === 'MISSING' ? null : undefined,
      OR: query.search ? [
        { title: { contains: query.search, mode: 'insensitive' } },
        ...(numericSearch ? [{ number: numericSearch }] : []),
      ] : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.episode.findMany({ where, include: { season: true, series: true, subtitles: true, mediaFile: true }, orderBy: [{ season: { number: 'asc' } }, { position: 'asc' }, { number: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.episode.count({ where }),
    ]);
    const jobs = items.length ? await this.prisma.videoProcessingJob.findMany({
      where: { targetType: VideoProcessingTargetType.EPISODE, targetId: { in: items.map((item) => item.id) } },
      include: { inputMediaFile: { select: { originalName: true } } },
      orderBy: { createdAt: 'desc' },
    }) : [];
    const jobsByEpisode = new Map<string | null, ReturnType<EpisodesService['presentEpisodeJob']>>();
    for (const job of jobs) if (!jobsByEpisode.has(job.targetId)) jobsByEpisode.set(job.targetId, this.presentEpisodeJob(job));
    return { items: items.map((item) => ({ ...item, mediaFile: item.mediaFile ? { ...item.mediaFile, sizeBytes: item.mediaFile.sizeBytes.toString() } : null, processingJob: jobsByEpisode.get(item.id) ?? null })), total, page: query.page, limit: query.limit };
  }

  async adminById(id: string) {
    const episode = await this.prisma.episode.findFirst({
      where: { id, deletedAt: null },
      include: { season: true, series: true, subtitles: true, mediaFile: true },
    });
    if (!episode) throw new NotFoundException('Episodio no encontrado');
    const job = await this.prisma.videoProcessingJob.findFirst({
      where: { targetType: VideoProcessingTargetType.EPISODE, targetId: id },
      include: { inputMediaFile: { select: { originalName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { ...episode, mediaFile: episode.mediaFile ? { ...episode.mediaFile, sizeBytes: episode.mediaFile.sizeBytes.toString() } : null, processingJob: job ? this.presentEpisodeJob(job) : null };
  }

  async bySeriesSlug(slug: string) {
    const series = await this.prisma.series.findFirst({ where: publishedSeriesWhere({ slug }) });
    if (!series) throw new NotFoundException('Serie no encontrada');
    return this.prisma.episode.findMany({
      where: publishedEpisodeWhere({ seriesId: series.id }),
      include: { season: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] } },
      orderBy: [{ season: { number: 'asc' } }, { position: 'asc' }, { number: 'asc' }],
    }).then(toCatalogResponse);
  }

  async byId(id: string, ip?: string) {
    const episode = await this.prisma.episode.findFirst({
      where: publishedEpisodeWhere({ id }),
      include: { season: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] }, series: { include: { genres: true } } },
    });
    if (!episode) throw new NotFoundException('Episodio no encontrado');
    await this.prisma.$transaction([
      this.prisma.episode.update({ where: { id }, data: { views: { increment: 1 } } }),
      this.prisma.viewLog.create({ data: { episodeId: id, seriesId: episode.seriesId, ip } }),
    ]);
    return toCatalogResponse(episode);
  }

  async create(dto: CreateEpisodeDto, userId: string) {
    const seriesId = dto.seriesId.trim();
    const episodeNumber = Number(dto.episodeNumber);
    if (!seriesId) throw new BadRequestException('Selecciona una serie');
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) throw new BadRequestException('El numero de episodio debe ser un entero mayor que cero');
    if ([Boolean(dto.processingJobId), Boolean(dto.mediaFileId), Boolean(dto.videoUrl?.trim())].filter(Boolean).length > 1) throw new BadRequestException('Selecciona un archivo, un trabajo de video o una URL, no varios');
    if (dto.published && !dto.processingJobId && !dto.mediaFileId && !dto.videoUrl?.trim()) throw new BadRequestException('No se puede publicar un episodio sin video');
    validatePlaybackMarkers(dto, dto.durationSec);

    try {
      const directVideo = dto.videoUrl ? normalizeVideo({ ...dto, videoUrl: dto.videoUrl, videoSource: dto.videoSource ?? 'URL', videoType: dto.videoType ?? 'MP4' }) : null;
      if (directVideo) await this.assertLocalReady(directVideo);
      return await this.prisma.$transaction(async (tx) => {
        const series = await tx.series.findFirst({ where: { id: seriesId, deletedAt: null }, select: { id: true } });
        if (!series) throw new BadRequestException('La serie seleccionada no existe');
        const season = await tx.season.findFirst({ where: dto.seasonId ? { id: dto.seasonId, seriesId, deletedAt: null } : { seriesId, number: 1, deletedAt: null } });
        if (!season) throw new BadRequestException('Selecciona una temporada valida para la serie');
        await this.releaseArchivedNumber(tx, season.id, episodeNumber);
        const job = dto.processingJobId ? await this.linkableJob(tx, dto.processingJobId, userId) : null;
        const media = dto.mediaFileId ? await this.linkableMedia(tx, dto.mediaFileId) : null;
        const playbackMode = dto.playbackMode ?? this.defaultPlaybackMode(job, media, directVideo);
        const jobVideo = job ? await this.videoFromJob(job, playbackMode, Boolean(dto.published)) : media ? await this.videoFromMedia(media, playbackMode, Boolean(dto.published)) : null;
        const positionAggregate = await tx.episode.aggregate({ where: { seasonId: season.id, deletedAt: null }, _max: { position: true } });
        const position = dto.position ?? (positionAggregate._max.position ?? 0) + 1;
        const episode = await tx.episode.create({
          data: { seriesId, seasonId: season.id, number: episodeNumber, position, title: dto.title.trim(), description: dto.description?.trim() || '', mediaFileId: job?.inputMediaFileId ?? media?.id ?? null, playbackMode, videoSource: jobVideo?.videoSource ?? directVideo?.videoSource ?? VideoSource.URL, videoType: jobVideo?.videoType ?? directVideo?.videoType ?? VideoType.MP4, videoUrl: jobVideo?.videoUrl ?? directVideo?.videoUrl ?? null, originalVideoUrl: jobVideo?.originalVideoUrl ?? directVideo?.originalVideoUrl ?? null, remuxedVideoUrl: jobVideo?.remuxedVideoUrl ?? dto.remuxedVideoUrl ?? null, processedVideoUrl: jobVideo?.processedVideoUrl ?? directVideo?.processedVideoUrl ?? null, thumbnailUrl: jobVideo?.thumbnailUrl ?? (dto.thumbnailUrl?.trim() || null), durationSec: dto.durationSec ?? jobVideo?.durationSec, introStartSec: dto.introStartSec, introEndSec: dto.introEndSec, recapStartSec: dto.recapStartSec, recapEndSec: dto.recapEndSec, published: Boolean(dto.published && (directVideo || jobVideo?.videoUrl)), publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date() },
        });
        if (job) await this.reserveJob(tx, job, episode.id);
        return tx.episode.findUniqueOrThrow({ where: { id: episode.id }, include: { season: true, series: true, subtitles: true } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.handlePrismaError(error, 'crear');
    }
  }

  async update(id: string, dto: UpdateEpisodeDto, userId: string) {
    if ([Boolean(dto.processingJobId), Boolean(dto.mediaFileId), Boolean(dto.videoUrl?.trim())].filter(Boolean).length > 1) throw new BadRequestException('Selecciona un archivo, un trabajo de video o una URL, no varios');
    const current = await this.prisma.episode.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('Episodio no encontrado');
    const seasonId = dto.seasonId ?? current.seasonId;
    const season = await this.prisma.season.findFirst({ where: { id: seasonId, deletedAt: null }, select: { id: true, seriesId: true } });
    if (!season) throw new BadRequestException('La temporada seleccionada no existe');
    const seriesId = season.seriesId;
    const markers = { introStartSec: dto.introStartSec !== undefined ? dto.introStartSec : current.introStartSec, introEndSec: dto.introEndSec !== undefined ? dto.introEndSec : current.introEndSec, recapStartSec: dto.recapStartSec !== undefined ? dto.recapStartSec : current.recapStartSec, recapEndSec: dto.recapEndSec !== undefined ? dto.recapEndSec : current.recapEndSec };
    validatePlaybackMarkers(markers, dto.durationSec ?? current.durationSec);
    const videoWasSubmitted = dto.videoUrl !== undefined;
    const mediaWasSubmitted = dto.mediaFileId !== undefined;
    const submittedVideoUrl = videoWasSubmitted ? dto.videoUrl?.trim() || null : null;
    const video = submittedVideoUrl ? normalizeVideo({ videoUrl: submittedVideoUrl, videoSource: dto.videoSource ?? current.videoSource, videoType: dto.videoType ?? current.videoType, originalVideoUrl: dto.originalVideoUrl ?? current.originalVideoUrl ?? undefined, processedVideoUrl: dto.processedVideoUrl ?? current.processedVideoUrl ?? undefined }) : null;
    if (video) await this.assertLocalReady(video);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.episodeNumber !== undefined) await this.releaseArchivedNumber(tx, seasonId, dto.episodeNumber);
        const job = dto.processingJobId ? await this.linkableJob(tx, dto.processingJobId, userId, id) : null;
        const mediaIdToResolve = dto.mediaFileId || (dto.playbackMode !== undefined ? current.mediaFileId : null);
        const media = mediaIdToResolve ? await this.linkableMedia(tx, mediaIdToResolve) : null;
        const mediaChanged = mediaWasSubmitted && dto.mediaFileId !== current.mediaFileId;
        const currentPlaybackMode = current.playbackMode ?? (current.videoType === VideoType.HLS ? EpisodePlaybackMode.HLS : EpisodePlaybackMode.ORIGINAL);
        const playbackMode = dto.playbackMode ?? (job || (mediaWasSubmitted && mediaChanged) ? this.defaultPlaybackMode(job, media, video) : currentPlaybackMode);
        const processingReferenceChanged = Boolean(job || mediaChanged || videoWasSubmitted);
        const videoReferenceChanged = Boolean(processingReferenceChanged || dto.playbackMode !== undefined);
        const requireReady = Boolean(dto.published || (current.published && videoReferenceChanged && (job || media)));
        const jobVideo = job ? await this.videoFromJob(job, playbackMode, requireReady) : media ? await this.videoFromMedia(media, playbackMode, requireReady) : null;
        const nextVideoUrl = jobVideo?.videoUrl ?? video?.videoUrl ?? (videoReferenceChanged ? null : current.videoUrl);
        const nextOriginalUrl = jobVideo?.originalVideoUrl ?? video?.originalVideoUrl ?? (videoReferenceChanged ? null : current.originalVideoUrl);
        const nextRemuxedUrl = jobVideo?.remuxedVideoUrl ?? dto.remuxedVideoUrl ?? (videoReferenceChanged ? null : current.remuxedVideoUrl);
        const nextProcessedUrl = jobVideo?.processedVideoUrl ?? video?.processedVideoUrl ?? (videoReferenceChanged ? null : current.processedVideoUrl);
        const nextHasReadyVideo = Boolean(nextVideoUrl);
        if (dto.published && !nextHasReadyVideo) throw new BadRequestException(this.playbackUnavailableMessage(playbackMode));
        if (processingReferenceChanged) {
          const selectedMediaId = job?.inputMediaFileId ?? media?.id;
          await tx.videoProcessingJob.updateMany({
            where: { targetType: VideoProcessingTargetType.EPISODE, targetId: id, ...(selectedMediaId ? { inputMediaFileId: { not: selectedMediaId } } : {}) },
            data: { targetType: null, targetId: null, associatedAt: null },
          });
        }
        const episode = await tx.episode.update({
          where: { id },
          data: { seriesId, seasonId, number: dto.episodeNumber, position: dto.position, title: dto.title?.trim(), description: dto.description?.trim(), mediaFileId: job?.inputMediaFileId ?? (mediaWasSubmitted ? media?.id ?? null : current.mediaFileId), playbackMode, videoUrl: nextVideoUrl, originalVideoUrl: nextOriginalUrl, remuxedVideoUrl: nextRemuxedUrl, processedVideoUrl: nextProcessedUrl, thumbnailUrl: jobVideo?.thumbnailUrl ?? dto.thumbnailUrl?.trim(), durationSec: dto.durationSec ?? jobVideo?.durationSec, introStartSec: dto.introStartSec, introEndSec: dto.introEndSec, recapStartSec: dto.recapStartSec, recapEndSec: dto.recapEndSec, published: dto.published === undefined ? (videoReferenceChanged ? Boolean(current.published && nextHasReadyVideo) : undefined) : Boolean(dto.published && nextHasReadyVideo), videoSource: jobVideo?.videoSource ?? video?.videoSource ?? current.videoSource, videoType: jobVideo?.videoType ?? video?.videoType ?? current.videoType, publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined },
        });
        if (job) await this.reserveJob(tx, job, episode.id);
        return tx.episode.findUniqueOrThrow({ where: { id }, include: { season: true, series: true, subtitles: true } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.handlePrismaError(error, 'actualizar');
    }
  }

  async bulkCreate(dto: BulkCreateEpisodesDto) {
    const normalized = dto.episodes.map((item) => ({ item, video: normalizeVideo(item) }));
    await Promise.all(normalized.map(({ video }) => this.assertLocalReady(video)));
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const season = await transaction.season.findFirst({ where: { id: dto.seasonId, seriesId: dto.seriesId, deletedAt: null } });
        if (!season) throw new BadRequestException('La temporada no pertenece a la serie seleccionada');
        const requested = normalized.flatMap(({ item }) => item.episodeNumber ? [item.episodeNumber] : []);
        if (new Set(requested).size !== requested.length) throw new BadRequestException('Hay numeros de episodio duplicados en el lote');
        if (requested.length && await transaction.episode.count({ where: { seasonId: dto.seasonId, number: { in: requested }, deletedAt: null } })) throw new ConflictException('Uno o mas numeros de episodio ya existen en la temporada');
        const aggregate = await transaction.episode.aggregate({ where: { seasonId: dto.seasonId, deletedAt: null }, _max: { number: true, position: true } });
        let nextNumber = aggregate._max.number ?? 0;
        let nextPosition = aggregate._max.position ?? 0;
        const created = [];
        for (const { item, video } of normalized) {
          const number = item.episodeNumber ?? ++nextNumber;
          await this.releaseArchivedNumber(transaction, dto.seasonId, number);
          nextNumber = Math.max(nextNumber, number);
          nextPosition += 1;
          created.push(await transaction.episode.create({
            data: { seriesId: dto.seriesId, seasonId: dto.seasonId, number, position: nextPosition, title: item.title.trim(), description: item.description?.trim() || '', videoUrl: video.videoUrl, originalVideoUrl: video.originalVideoUrl, processedVideoUrl: video.processedVideoUrl, playbackMode: video.videoType === VideoType.HLS ? EpisodePlaybackMode.HLS : EpisodePlaybackMode.ORIGINAL, videoSource: video.videoSource, videoType: video.videoType, thumbnailUrl: item.thumbnailUrl?.trim() || null, durationSec: item.durationSec, published: item.published ?? false, publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date() },
            include: { season: true, series: true },
          }));
        }
        return { created };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.handlePrismaError(error, 'crear el lote de');
    }
  }

  async reorder(dto: ReorderEpisodesDto) {
    if (new Set(dto.items.map((item) => item.id)).size !== dto.items.length) throw new BadRequestException('Hay episodios duplicados en la solicitud');
    const count = await this.prisma.episode.count({ where: { seasonId: dto.seasonId, deletedAt: null, id: { in: dto.items.map((item) => item.id) } } });
    if (count !== dto.items.length) throw new BadRequestException('Todos los episodios deben pertenecer a la temporada');
    await this.prisma.$transaction(dto.items.map((item) => this.prisma.episode.update({ where: { id: item.id }, data: { position: item.position } })));
    return { reordered: dto.items.length };
  }

  async publish(dto: PublishEpisodesDto) {
    const ids = [...new Set(dto.ids)];
    if (dto.published) {
      const withoutVideo = await this.prisma.episode.count({ where: { id: { in: ids }, deletedAt: null, videoUrl: null } });
      if (withoutVideo) throw new ConflictException('No se puede publicar un episodio cuyo video aun no esta listo');
    }
    const result = await this.prisma.episode.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { published: dto.published } });
    if (result.count !== ids.length) throw new BadRequestException('Uno o mas episodios no existen');
    return { updated: result.count, published: dto.published };
  }

  async copySettings(dto: CopyEpisodeSettingsDto) {
    const source = await this.prisma.episode.findFirst({ where: { id: dto.sourceEpisodeId, deletedAt: null } });
    if (!source) throw new NotFoundException('Episodio de origen no encontrado');
    const targetIds = [...new Set(dto.targetEpisodeIds.filter((id) => id !== source.id))];
    const targets = await this.prisma.episode.count({ where: { id: { in: targetIds }, deletedAt: null } });
    if (!targetIds.length || targets !== targetIds.length) throw new BadRequestException('Uno o mas episodios de destino no existen');
    const fields = dto.fields ?? ['video', 'thumbnail', 'duration'];
    const data: Prisma.EpisodeUpdateManyMutationInput = {};
    if (fields.includes('video')) Object.assign(data, { mediaFileId: source.mediaFileId, playbackMode: source.playbackMode, videoUrl: source.videoUrl, originalVideoUrl: source.originalVideoUrl, remuxedVideoUrl: source.remuxedVideoUrl, processedVideoUrl: source.processedVideoUrl, videoSource: source.videoSource, videoType: source.videoType });
    if (fields.includes('thumbnail')) data.thumbnailUrl = source.thumbnailUrl;
    if (fields.includes('description')) data.description = source.description;
    if (fields.includes('duration')) data.durationSec = source.durationSec;
    const result = await this.prisma.episode.updateMany({ where: { id: { in: targetIds }, deletedAt: null }, data });
    return { updated: result.count };
  }

  async gaps(seasonId: string) {
    const episodes = await this.prisma.episode.findMany({ where: { seasonId, deletedAt: null }, select: { number: true }, orderBy: { number: 'asc' } });
    return findMissingEpisodeNumbers(episodes.map((episode) => episode.number));
  }

  async remove(id: string) {
    const current = await this.prisma.episode.findFirst({ where: { id, deletedAt: null }, select: { id: true, seasonId: true } });
    if (!current) throw new NotFoundException('Episodio no encontrado');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const archivedNumber = await this.nextArchivedNumber(tx, current.seasonId);
        const episode = await tx.episode.update({
          where: { id },
          data: { number: archivedNumber, deletedAt: new Date(), published: false },
        });
        await tx.videoProcessingJob.updateMany({
          where: { targetType: VideoProcessingTargetType.EPISODE, targetId: id },
          data: { targetType: null, targetId: null, associatedAt: null },
        });
        return episode;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.handlePrismaError(error, 'eliminar');
    }
  }

  private async releaseArchivedNumber(tx: Prisma.TransactionClient, seasonId: string, number: number) {
    const archived = await tx.episode.findFirst({ where: { seasonId, number, deletedAt: { not: null } }, select: { id: true } });
    if (!archived) return;
    const archivedNumber = await this.nextArchivedNumber(tx, seasonId);
    await tx.episode.update({ where: { id: archived.id }, data: { number: archivedNumber } });
    await tx.videoProcessingJob.updateMany({
      where: { targetType: VideoProcessingTargetType.EPISODE, targetId: archived.id },
      data: { targetType: null, targetId: null, associatedAt: null },
    });
  }

  private async nextArchivedNumber(tx: Prisma.TransactionClient, seasonId: string) {
    const aggregate = await tx.episode.aggregate({ where: { seasonId }, _min: { number: true } });
    return Math.min((aggregate._min.number ?? 0) - 1, -1);
  }

  private async linkableJob(tx: Prisma.TransactionClient, id: string, userId: string, episodeId?: string) {
    const job = await tx.videoProcessingJob.findUnique({ where: { id }, include: { inputMediaFile: true, outputMediaFile: true } });
    if (!job) throw new NotFoundException('El archivo o trabajo de video seleccionado no existe');
    if (job.requestedById !== userId) throw new ConflictException('No puedes relacionar un archivo cargado por otro usuario');
    const allowedStatuses = new Set<VideoProcessingStatus>([VideoProcessingStatus.QUEUED, VideoProcessingStatus.PROCESSING, VideoProcessingStatus.COMPLETED]);
    if (!allowedStatuses.has(job.status)) {
      throw new ConflictException(job.status === VideoProcessingStatus.CANCELLED ? 'El procesamiento del video fue cancelado' : 'El procesamiento del video fallo. Reintentalo antes de relacionarlo');
    }
    if (job.targetType && job.targetType !== VideoProcessingTargetType.EPISODE) throw new ConflictException('El archivo seleccionado ya esta asociado a otro contenido');
    if (job.targetId && job.targetId !== episodeId) throw new ConflictException('El archivo seleccionado ya esta asociado a otro episodio');
    if (job.status === VideoProcessingStatus.COMPLETED && (job.kind === 'REMUX' ? !job.outputMediaFile : !job.masterPath)) throw new ConflictException('El procesamiento termino sin una salida valida');
    return job;
  }

  private async videoFromJob(job: LinkableVideoJob, playbackMode: EpisodePlaybackMode, requireReady: boolean) {
    const originalVideoUrl = this.storage.publicUrl(job.inputMediaFile.relativePath);
    const processedVideoUrl = job.kind !== 'REMUX' && job.status === VideoProcessingStatus.COMPLETED && job.masterPath ? this.storage.publicUrl(job.masterPath) : null;
    const remuxedVideoUrl = job.kind === 'REMUX' && job.status === VideoProcessingStatus.COMPLETED && job.outputMediaFile ? this.storage.publicUrl(job.outputMediaFile.relativePath) : null;
    const originalCompatible = directPlaybackCompatibility(job.inputMediaFile).compatible;
    await this.assertSelectedVersion(job.inputMediaFile, job.kind === 'HLS' ? job : null, job.kind === 'REMUX' ? job : null, playbackMode, requireReady);
    const videoUrl = playbackMode === EpisodePlaybackMode.HLS ? processedVideoUrl : playbackMode === EpisodePlaybackMode.REMUX ? remuxedVideoUrl : originalCompatible ? originalVideoUrl : null;
    return { videoUrl, originalVideoUrl, remuxedVideoUrl, processedVideoUrl, thumbnailUrl: job.thumbnailPath ? this.storage.publicUrl(job.thumbnailPath) : null, durationSec: job.durationSec ? Math.round(job.durationSec) : undefined, videoSource: playbackMode === EpisodePlaybackMode.HLS ? VideoSource.HLS : VideoSource.LOCAL, videoType: playbackMode === EpisodePlaybackMode.HLS ? VideoType.HLS : VideoType.MP4 };
  }

  private async linkableMedia(tx: Prisma.TransactionClient, id: string) {
    const media = await tx.mediaFile.findFirst({
      where: { id, mediaType: 'VIDEO', status: { not: MediaStatus.DELETED } },
      include: { inputJobs: { include: { outputMediaFile: true }, orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!media) throw new NotFoundException('El archivo de video seleccionado no existe');
    return media;
  }

  private async videoFromMedia(media: LinkableMedia, playbackMode: EpisodePlaybackMode, requireReady: boolean) {
    const completed = media.inputJobs.find((job) => job.kind === 'HLS' && job.status === VideoProcessingStatus.COMPLETED && Boolean(job.masterPath));
    const remux = media.inputJobs.find((job) => job.kind === 'REMUX' && job.status === VideoProcessingStatus.COMPLETED && Boolean(job.outputMediaFile));
    const originalVideoUrl = this.storage.publicUrl(media.relativePath);
    const processedVideoUrl = completed?.masterPath ? this.storage.publicUrl(completed.masterPath) : null;
    const remuxedVideoUrl = remux?.outputMediaFile ? this.storage.publicUrl(remux.outputMediaFile.relativePath) : null;
    const directlyPlayable = directPlaybackCompatibility(media).compatible;
    await this.assertSelectedVersion(media, completed ?? null, remux ?? null, playbackMode, requireReady);
    const videoUrl = playbackMode === EpisodePlaybackMode.HLS ? processedVideoUrl : playbackMode === EpisodePlaybackMode.REMUX ? remuxedVideoUrl : directlyPlayable ? originalVideoUrl : null;
    return { videoUrl, originalVideoUrl, remuxedVideoUrl, processedVideoUrl, thumbnailUrl: completed?.thumbnailPath ? this.storage.publicUrl(completed.thumbnailPath) : null, durationSec: completed?.durationSec ? Math.round(completed.durationSec) : remux?.durationSec ? Math.round(remux.durationSec) : media.durationSec ? Math.round(media.durationSec) : undefined, videoSource: playbackMode === EpisodePlaybackMode.HLS ? VideoSource.HLS : VideoSource.LOCAL, videoType: playbackMode === EpisodePlaybackMode.HLS ? VideoType.HLS : VideoType.MP4 };
  }

  private defaultPlaybackMode(job: LinkableVideoJob | null, media: LinkableMedia | null, directVideo: NormalizedVideo | null) {
    if (directVideo) return directVideo.videoType === VideoType.HLS ? EpisodePlaybackMode.HLS : EpisodePlaybackMode.ORIGINAL;
    if (job) return job.kind === 'REMUX' ? EpisodePlaybackMode.REMUX : EpisodePlaybackMode.HLS;
    const hlsReady = Boolean(media?.inputJobs.some((item) => item.status === VideoProcessingStatus.COMPLETED && item.masterPath));
    return hlsReady ? EpisodePlaybackMode.HLS : EpisodePlaybackMode.ORIGINAL;
  }

  private async assertSelectedVersion(
    input: LinkableMedia | LinkableVideoJob['inputMediaFile'],
    hls: LinkableVideoJob | LinkableMedia['inputJobs'][number] | null,
    remux: LinkableVideoJob | LinkableMedia['inputJobs'][number] | null,
    playbackMode: EpisodePlaybackMode,
    requireReady: boolean,
  ) {
    if (playbackMode === EpisodePlaybackMode.ORIGINAL) {
      if (input.sizeBytes <= 0n) throw new ConflictException('El archivo original seleccionado esta vacio');
      if (!await this.storage.exists(input.relativePath)) throw new ConflictException('El archivo original seleccionado no existe en el almacenamiento');
      if (requireReady && !directPlaybackCompatibility(input).compatible) throw new BadRequestException(this.playbackUnavailableMessage(playbackMode));
      return;
    }
    if (playbackMode === EpisodePlaybackMode.REMUX) {
      if (!remux || remux.status !== VideoProcessingStatus.COMPLETED || !remux.outputMediaFile) {
        if (requireReady) throw new BadRequestException(this.playbackUnavailableMessage(playbackMode));
        return;
      }
      if (remux.outputMediaFile.status !== MediaStatus.READY || remux.outputMediaFile.extension.toLowerCase() !== '.mp4' || remux.outputMediaFile.sizeBytes <= 0n) throw new ConflictException('La salida REMUX no es un MP4 valido y listo');
      if (!await this.storage.exists(remux.outputMediaFile.relativePath)) throw new ConflictException('El MP4 remux seleccionado no existe en el almacenamiento');
      return;
    }
    if (!hls || hls.status !== VideoProcessingStatus.COMPLETED || !hls.masterPath) {
      if (requireReady) throw new BadRequestException(this.playbackUnavailableMessage(playbackMode));
      return;
    }
    if (!hls.outputMediaFile || hls.outputMediaFile.status !== MediaStatus.READY) throw new ConflictException('La salida HLS no esta marcada como lista');
    if (!await this.storage.exists(hls.masterPath)) throw new ConflictException('El manifiesto HLS seleccionado no existe en el almacenamiento');
  }

  private playbackUnavailableMessage(playbackMode: EpisodePlaybackMode) {
    if (playbackMode === EpisodePlaybackMode.REMUX) return 'El MP4 remux sigue procesandose o no esta listo. Guarda el episodio como borrador o selecciona otra fuente.';
    if (playbackMode === EpisodePlaybackMode.HLS) return 'El HLS sigue procesandose o no esta listo. Guarda el episodio como borrador o selecciona otra fuente.';
    return 'El archivo original no existe o no es compatible para publicacion directa. Selecciona REMUX/HLS o guarda como borrador.';
  }

  private async reserveJob(tx: Prisma.TransactionClient, job: LinkableVideoJob, episodeId: string) {
    const reserved = await tx.videoProcessingJob.updateMany({
      where: { id: job.id, requestedById: job.requestedById, status: { in: [VideoProcessingStatus.QUEUED, VideoProcessingStatus.PROCESSING, VideoProcessingStatus.COMPLETED] }, OR: [{ targetType: null, targetId: null }, { targetType: VideoProcessingTargetType.EPISODE, targetId: episodeId }] },
      data: { targetType: VideoProcessingTargetType.EPISODE, targetId: episodeId, associatedAt: job.status === VideoProcessingStatus.COMPLETED ? new Date() : null, processingStage: job.status === VideoProcessingStatus.COMPLETED ? 'COMPLETED' : job.processingStage },
    });
    if (reserved.count !== 1) throw new ConflictException('No se pudo relacionar el video porque otro episodio ya lo utilizo');
    if (job.status === VideoProcessingStatus.COMPLETED) await this.createJobSubtitles(tx, job, episodeId);
  }

  private async createJobSubtitles(tx: Prisma.TransactionClient, job: LinkableVideoJob, episodeId: string) {
    if (!Array.isArray(job.subtitleTracks)) return;
    for (const [index, value] of job.subtitleTracks.entries()) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const track = value as Record<string, Prisma.JsonValue>;
      if (![track.url, track.language, track.label, track.originalName].every((field) => typeof field === 'string')) continue;
      const exists = await tx.subtitleTrack.count({ where: { episodeId, language: track.language as string, url: track.url as string } });
      if (!exists) await tx.subtitleTrack.create({ data: { episodeId, language: track.language as string, label: track.label as string, url: track.url as string, originalName: track.originalName as string, sourceFormat: 'VTT', isDefault: index === 0, isActive: true } });
    }
  }

  private presentEpisodeJob(job: EpisodeJobSummary) {
    return { id: job.id, status: job.status, progress: job.progress, stage: job.processingStage, originalName: job.inputMediaFile.originalName, targetType: job.targetType, targetId: job.targetId, masterUrl: job.masterPath ? this.storage.publicUrl(job.masterPath) : null, thumbnailUrl: job.thumbnailPath ? this.storage.publicUrl(job.thumbnailPath) : null, errorMessage: job.errorMessage, createdAt: job.createdAt, updatedAt: job.updatedAt };
  }

  private async assertLocalReady(video: NormalizedVideo) {
    if (video.videoSource !== VideoSource.LOCAL) return;
    const match = /^\/(?:uploads|api\/storage\/objects)\/(.+)$/.exec(video.videoUrl);
    const media = match ? await this.prisma.mediaFile.findUnique({ where: { relativePath: match[1] }, select: { status: true } }) : null;
    if (!media || media.status !== MediaStatus.READY) throw new ConflictException('El video local aun no termino de procesarse');
  }

  private handlePrismaError(error: unknown, action: string): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('Ya existe un episodio con ese numero para la temporada seleccionada');
      if (error.code === 'P2003') throw new BadRequestException('La serie o temporada seleccionada no existe');
      if (error.code === 'P2025') throw new NotFoundException('El episodio, serie o temporada no fue encontrado');
    }
    this.logger.error(`No se pudo ${action} episodio`, error instanceof Error ? error.stack : String(error));
    throw new InternalServerErrorException(`No se pudo ${action} episodio. Revisa los datos enviados y los logs del backend.`);
  }
}
