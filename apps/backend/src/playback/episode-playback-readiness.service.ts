import { Injectable, Logger } from '@nestjs/common';
import { EpisodePlaybackMode, MediaStatus, Prisma, VideoProcessingKind, VideoProcessingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { directPlaybackCompatibility } from '../video-processing/direct-playback';

const playbackInclude = Prisma.validator<Prisma.EpisodeInclude>()({
  season: { select: { published: true, deletedAt: true } },
  series: { select: { deletedAt: true } },
  mediaFile: {
    include: {
      inputJobs: {
        include: { outputMediaFile: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  },
});

type PlaybackEpisode = Prisma.EpisodeGetPayload<{ include: typeof playbackInclude }>;
type PlaybackMedia = NonNullable<PlaybackEpisode['mediaFile']>;
type PlaybackJob = PlaybackMedia['inputJobs'][number];

export type EpisodePlaybackReason =
  | 'SOURCE_NOT_CONFIGURED'
  | 'MEDIA_FILE_NOT_FOUND'
  | 'MEDIA_FILE_NOT_READY'
  | 'MEDIA_FILE_EMPTY'
  | 'ORIGINAL_NOT_BROWSER_COMPATIBLE'
  | 'ORIGINAL_FILE_NOT_FOUND'
  | 'REMUX_NOT_FOUND'
  | 'REMUX_PROCESSING'
  | 'REMUX_FAILED'
  | 'REMUX_OUTPUT_INVALID'
  | 'REMUX_FILE_NOT_FOUND'
  | 'HLS_NOT_FOUND'
  | 'HLS_PROCESSING'
  | 'HLS_FAILED'
  | 'HLS_OUTPUT_INVALID'
  | 'HLS_MASTER_PATH_INVALID'
  | 'HLS_MASTER_NOT_FOUND'
  | 'HLS_MASTER_EMPTY'
  | 'LOCAL_SOURCE_NOT_FOUND'
  | 'EXTERNAL_SOURCE_INVALID';

export type EpisodePublicationState = 'DRAFT' | 'PROCESSING' | 'READY' | 'PUBLISHED' | 'PUBLISHED_HIDDEN' | 'PUBLISHED_UNAVAILABLE';

export type EpisodePlaybackReadiness = {
  playable: boolean;
  processing: boolean;
  mode: EpisodePlaybackMode;
  sourceType: 'ORIGINAL' | 'REMUX' | 'HLS' | 'EXTERNAL';
  mediaFileId: string | null;
  path: string | null;
  url: string | null;
  reason: EpisodePlaybackReason | null;
  message: string | null;
};

export type PlaybackSourceInput = {
  mode: EpisodePlaybackMode;
  mediaFileId?: string | null;
  media?: PlaybackMedia | null;
  videoUrl?: string | null;
  originalVideoUrl?: string | null;
  remuxedVideoUrl?: string | null;
  processedVideoUrl?: string | null;
};

@Injectable()
export class EpisodePlaybackReadinessService {
  private readonly logger = new Logger(EpisodePlaybackReadinessService.name);

  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService) {}

  async getEpisode(id: string) {
    const episode = await this.prisma.episode.findFirst({ where: { id, deletedAt: null }, include: playbackInclude });
    if (!episode) return null;
    const readiness = await this.evaluateEpisode(episode);
    return { episode, readiness, publicationState: this.publicationState(episode, readiness) };
  }

  async getMany(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return new Map<string, { readiness: EpisodePlaybackReadiness; publicationState: EpisodePublicationState }>();
    const episodes = await this.prisma.episode.findMany({ where: { id: { in: uniqueIds }, deletedAt: null }, include: playbackInclude });
    const entries = await Promise.all(episodes.map(async (episode) => {
      const readiness = await this.evaluateEpisode(episode);
      return [episode.id, { readiness, publicationState: this.publicationState(episode, readiness) }] as const;
    }));
    return new Map(entries);
  }

  evaluateEpisode(episode: PlaybackEpisode) {
    return this.evaluateSource({
      mode: episode.playbackMode,
      mediaFileId: episode.mediaFileId,
      media: episode.mediaFile,
      videoUrl: episode.videoUrl,
      originalVideoUrl: episode.originalVideoUrl,
      remuxedVideoUrl: episode.remuxedVideoUrl,
      processedVideoUrl: episode.processedVideoUrl,
    }, episode.id);
  }

  async evaluateSource(input: PlaybackSourceInput, episodeId?: string): Promise<EpisodePlaybackReadiness> {
    const result = input.mediaFileId
      ? input.media
        ? await this.evaluateManaged(input.mode, input.media)
        : this.unavailable(input.mode, input.mediaFileId, 'MEDIA_FILE_NOT_FOUND')
      : await this.evaluateLegacy(input);
    if (!result.playable) {
      this.logger.warn(`episode_playback_validation_failed episodeId=${episodeId ?? 'unassigned'} playbackMode=${result.mode} reason=${result.reason}`);
    }
    return result;
  }

  publicationState(episode: Pick<PlaybackEpisode, 'published' | 'season' | 'series'>, readiness: EpisodePlaybackReadiness): EpisodePublicationState {
    if (episode.published) {
      if (!readiness.playable) return 'PUBLISHED_UNAVAILABLE';
      if (!episode.season.published || episode.season.deletedAt || episode.series.deletedAt) return 'PUBLISHED_HIDDEN';
      return 'PUBLISHED';
    }
    if (readiness.processing) return 'PROCESSING';
    return readiness.playable ? 'READY' : 'DRAFT';
  }

  message(reason: EpisodePlaybackReason) {
    return REASON_MESSAGES[reason];
  }

  private async evaluateManaged(mode: EpisodePlaybackMode, media: PlaybackMedia): Promise<EpisodePlaybackReadiness> {
    if (mode === EpisodePlaybackMode.ORIGINAL) {
      if (media.status !== MediaStatus.READY) return this.unavailable(mode, media.id, 'MEDIA_FILE_NOT_READY');
      if (media.sizeBytes <= 0n) return this.unavailable(mode, media.id, 'MEDIA_FILE_EMPTY');
      if (!directPlaybackCompatibility(media).compatible) return this.unavailable(mode, media.id, 'ORIGINAL_NOT_BROWSER_COMPATIBLE');
      if (!await this.nonEmpty(media.relativePath)) return this.unavailable(mode, media.id, 'ORIGINAL_FILE_NOT_FOUND');
      return this.ready(mode, media.id, media.relativePath);
    }

    const kind = mode === EpisodePlaybackMode.REMUX ? VideoProcessingKind.REMUX : VideoProcessingKind.HLS;
    const jobs = media.inputJobs.filter((job) => job.kind === kind);
    const completed = jobs.find((job) => job.status === VideoProcessingStatus.COMPLETED);
    const active = jobs.find((job) => job.status === VideoProcessingStatus.QUEUED || job.status === VideoProcessingStatus.PROCESSING);
    const failed = jobs.find((job) => job.status === VideoProcessingStatus.FAILED || job.status === VideoProcessingStatus.CANCELLED);

    if (!completed) {
      if (active) return this.unavailable(mode, media.id, mode === EpisodePlaybackMode.REMUX ? 'REMUX_PROCESSING' : 'HLS_PROCESSING', true);
      if (failed) return this.unavailable(mode, media.id, mode === EpisodePlaybackMode.REMUX ? 'REMUX_FAILED' : 'HLS_FAILED');
      return this.unavailable(mode, media.id, mode === EpisodePlaybackMode.REMUX ? 'REMUX_NOT_FOUND' : 'HLS_NOT_FOUND');
    }
    return mode === EpisodePlaybackMode.REMUX ? this.evaluateRemux(media, completed) : this.evaluateHls(media, completed);
  }

  private async evaluateRemux(media: PlaybackMedia, job: PlaybackJob): Promise<EpisodePlaybackReadiness> {
    const output = job.outputMediaFile;
    if (!output || output.status !== MediaStatus.READY || output.extension.toLowerCase() !== '.mp4' || output.sizeBytes <= 0n || !output.relativePath) {
      return this.unavailable(EpisodePlaybackMode.REMUX, media.id, 'REMUX_OUTPUT_INVALID');
    }
    if (!await this.nonEmpty(output.relativePath)) return this.unavailable(EpisodePlaybackMode.REMUX, media.id, 'REMUX_FILE_NOT_FOUND');
    return this.ready(EpisodePlaybackMode.REMUX, media.id, output.relativePath);
  }

  private async evaluateHls(media: PlaybackMedia, job: PlaybackJob): Promise<EpisodePlaybackReadiness> {
    if (!job.outputMediaFile || job.outputMediaFile.status !== MediaStatus.READY) return this.unavailable(EpisodePlaybackMode.HLS, media.id, 'HLS_OUTPUT_INVALID');
    if (!job.masterPath || job.masterPath !== `hls/${job.id}/master.m3u8`) return this.unavailable(EpisodePlaybackMode.HLS, media.id, 'HLS_MASTER_PATH_INVALID');
    if (!await this.storage.exists(job.masterPath)) return this.unavailable(EpisodePlaybackMode.HLS, media.id, 'HLS_MASTER_NOT_FOUND');
    const metadata = await this.storage.metadata(job.masterPath);
    if (!metadata) return this.unavailable(EpisodePlaybackMode.HLS, media.id, 'HLS_MASTER_NOT_FOUND');
    if (metadata.size <= 0) return this.unavailable(EpisodePlaybackMode.HLS, media.id, 'HLS_MASTER_EMPTY');
    return this.ready(EpisodePlaybackMode.HLS, media.id, job.masterPath);
  }

  private async evaluateLegacy(input: PlaybackSourceInput): Promise<EpisodePlaybackReadiness> {
    const selectedUrl = input.mode === EpisodePlaybackMode.HLS ? input.processedVideoUrl : input.mode === EpisodePlaybackMode.REMUX ? input.remuxedVideoUrl : input.originalVideoUrl || input.videoUrl;
    if (!selectedUrl) return this.unavailable(input.mode, null, 'SOURCE_NOT_CONFIGURED');
    const path = this.storage.keyFromUrl(selectedUrl);
    if (path) {
      if (!await this.nonEmpty(path)) return this.unavailable(input.mode, null, 'LOCAL_SOURCE_NOT_FOUND');
      return this.ready(input.mode, null, path);
    }
    if (!/^(?:https?:\/\/|\/\/)/i.test(selectedUrl) && !selectedUrl.startsWith('/')) return this.unavailable(input.mode, null, 'EXTERNAL_SOURCE_INVALID');
    return { playable: true, processing: false, mode: input.mode, sourceType: 'EXTERNAL', mediaFileId: null, path: null, url: selectedUrl, reason: null, message: null };
  }

  private async nonEmpty(path: string) {
    if (!await this.storage.exists(path)) return false;
    const metadata = await this.storage.metadata(path);
    return Boolean(metadata && metadata.size > 0);
  }

  private ready(mode: EpisodePlaybackMode, mediaFileId: string | null, path: string): EpisodePlaybackReadiness {
    return { playable: true, processing: false, mode, sourceType: mode, mediaFileId, path, url: this.storage.publicUrl(path), reason: null, message: null };
  }

  private unavailable(mode: EpisodePlaybackMode, mediaFileId: string | null, reason: EpisodePlaybackReason, processing = false): EpisodePlaybackReadiness {
    return { playable: false, processing, mode, sourceType: mode, mediaFileId, path: null, url: null, reason, message: REASON_MESSAGES[reason] };
  }
}

const REASON_MESSAGES: Record<EpisodePlaybackReason, string> = {
  SOURCE_NOT_CONFIGURED: 'No hay una fuente de reproducción configurada.',
  MEDIA_FILE_NOT_FOUND: 'El archivo multimedia asociado ya no existe en la base de datos.',
  MEDIA_FILE_NOT_READY: 'El archivo original todavía no está listo.',
  MEDIA_FILE_EMPTY: 'El archivo original está vacío.',
  ORIGINAL_NOT_BROWSER_COMPATIBLE: 'El archivo original no es compatible con reproducción directa en navegador.',
  ORIGINAL_FILE_NOT_FOUND: 'El archivo original no existe en el almacenamiento.',
  REMUX_NOT_FOUND: 'No existe una versión MP4 remux completada.',
  REMUX_PROCESSING: 'El video REMUX seleccionado todavía está procesándose.',
  REMUX_FAILED: 'El procesamiento REMUX falló o fue cancelado.',
  REMUX_OUTPUT_INVALID: 'La salida REMUX no es un MP4 válido y listo.',
  REMUX_FILE_NOT_FOUND: 'El archivo MP4 remux no existe en el almacenamiento.',
  HLS_NOT_FOUND: 'No existe una versión HLS completada.',
  HLS_PROCESSING: 'El video HLS seleccionado todavía está procesándose.',
  HLS_FAILED: 'El procesamiento HLS falló o fue cancelado.',
  HLS_OUTPUT_INVALID: 'La salida HLS no está marcada como lista.',
  HLS_MASTER_PATH_INVALID: 'El trabajo HLS no tiene una ruta master.m3u8 válida.',
  HLS_MASTER_NOT_FOUND: 'El manifiesto HLS master.m3u8 no existe en el almacenamiento.',
  HLS_MASTER_EMPTY: 'El manifiesto HLS master.m3u8 está vacío.',
  LOCAL_SOURCE_NOT_FOUND: 'La fuente local configurada no existe o está vacía.',
  EXTERNAL_SOURCE_INVALID: 'La URL externa configurada no es válida.',
};
