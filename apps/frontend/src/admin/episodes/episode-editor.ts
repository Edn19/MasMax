import { EpisodeProcessingJob, Season, SubtitleTrack, VideoSource, VideoType } from '../../types/models';
import { EpisodeVideoMode } from './episode-video-linking';

type LegacySeason = Omit<Partial<Season>, 'seriesId'> & {
  seriesId?: string | null;
  series?: { id?: string | null } | null;
};

export type EpisodeEditorSource = {
  id: string;
  title?: string | null;
  description?: string | null;
  number?: number | null;
  position?: number | null;
  publishedAt?: string | null;
  published?: unknown;
  season?: LegacySeason | null;
  seasonId?: string | null;
  seriesId?: string | null;
  subtitles?: SubtitleTrack[] | null;
  videoUrl?: string | null;
  originalVideoUrl?: string | null;
  processedVideoUrl?: string | null;
  videoSource?: VideoSource | null;
  videoType?: VideoType | null;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  introStartSec?: number | null;
  introEndSec?: number | null;
  recapStartSec?: number | null;
  recapEndSec?: number | null;
  processingJob?: EpisodeProcessingJob | null;
  processingJobId?: string | null;
};

export type EpisodeFormState = {
  seriesId: string;
  seasonId: string;
  number: string;
  position: string;
  title: string;
  description: string;
  videoMode: EpisodeVideoMode;
  processingJobId: string;
  processingJobStatus: EpisodeVideoState['status'];
  videoUrl: string;
  originalVideoUrl: string;
  processedVideoUrl: string;
  videoSource: VideoSource;
  videoType: VideoType;
  thumbnailUrl: string;
  durationSec: string;
  introStartSec: string;
  introEndSec: string;
  recapStartSec: string;
  recapEndSec: string;
  published: boolean;
  publishedAt: string;
};

export type EpisodeVideoState = {
  mode: EpisodeVideoMode;
  processingJobId: string;
  status: 'NONE' | 'URL' | EpisodeProcessingJob['status'] | 'MISSING';
  videoUrl: string;
  originalVideoUrl: string;
  processedVideoUrl: string;
  videoSource: VideoSource;
  videoType: VideoType;
};

export type UpdateEpisodePayload = {
  seasonId: string;
  episodeNumber?: number;
  position?: number;
  title: string;
  description: string;
  processingJobId?: string;
  videoSource?: VideoSource;
  videoType?: VideoType;
  videoUrl?: string;
  originalVideoUrl?: string;
  processedVideoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  introStartSec: number | null;
  introEndSec: number | null;
  recapStartSec: number | null;
  recapEndSec: number | null;
  published: boolean;
  publishedAt?: string;
};

export function resolveEpisodeVideoState(episode: EpisodeEditorSource): EpisodeVideoState {
  const directUrl = stringValue(episode.videoUrl);
  const originalUrl = stringValue(episode.originalVideoUrl) || directUrl;
  const processedUrl = stringValue(episode.processedVideoUrl) || directUrl;
  const jobId = stringValue(episode.processingJob?.id) || stringValue(episode.processingJobId);
  const inferred = inferVideoType(processedUrl || directUrl);
  const videoSource = episode.videoSource ?? inferred.videoSource;
  const videoType = episode.videoType ?? inferred.videoType;

  if (jobId) {
    const jobUrl = stringValue(episode.processingJob?.masterUrl);
    return {
      mode: 'AVAILABLE',
      processingJobId: jobId,
      status: episode.processingJob?.status ?? 'MISSING',
      videoUrl: directUrl || jobUrl,
      originalVideoUrl: originalUrl,
      processedVideoUrl: processedUrl || jobUrl,
      videoSource: jobUrl ? 'HLS' : videoSource,
      videoType: jobUrl ? 'HLS' : videoType,
    };
  }

  if (directUrl) {
    return { mode: 'URL', processingJobId: '', status: 'URL', videoUrl: directUrl, originalVideoUrl: originalUrl, processedVideoUrl: processedUrl, videoSource, videoType };
  }

  return { mode: 'NONE', processingJobId: '', status: 'NONE', videoUrl: '', originalVideoUrl: '', processedVideoUrl: '', videoSource, videoType };
}

export function episodeToFormState(episode: EpisodeEditorSource): EpisodeFormState {
  const video = resolveEpisodeVideoState(episode);
  return {
    seriesId: stringValue(episode.seriesId) || stringValue(episode.season?.seriesId) || stringValue(episode.season?.series?.id),
    seasonId: stringValue(episode.seasonId) || stringValue(episode.season?.id),
    number: numberValue(episode.number),
    position: numberValue(episode.position),
    title: stringValue(episode.title),
    description: stringValue(episode.description),
    videoMode: video.mode,
    processingJobId: video.processingJobId,
    processingJobStatus: video.status,
    videoUrl: video.videoUrl,
    originalVideoUrl: video.originalVideoUrl,
    processedVideoUrl: video.processedVideoUrl,
    videoSource: video.videoSource,
    videoType: video.videoType,
    thumbnailUrl: stringValue(episode.thumbnailUrl),
    durationSec: numberValue(episode.durationSec),
    introStartSec: numberValue(episode.introStartSec),
    introEndSec: numberValue(episode.introEndSec),
    recapStartSec: numberValue(episode.recapStartSec),
    recapEndSec: numberValue(episode.recapEndSec),
    published: normalizeEpisodePublished(episode.published),
    publishedAt: normalizeDateForInput(episode.publishedAt),
  };
}

export function normalizeEpisodePublished(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

export function withEpisodePublished<T extends { published: boolean }>(current: T, published: boolean): T {
  return withEpisodeFormField(current, 'published', published);
}

export function withEpisodeFormField<T, K extends keyof T>(current: T, field: K, value: T[K]): T {
  return { ...current, [field]: value };
}

export function validateEpisodeBasicInfo(form: Pick<EpisodeFormState, 'number' | 'position' | 'title' | 'durationSec' | 'publishedAt'>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isIntegerAtLeast(form.number, 1)) errors.number = 'El numero debe ser un entero mayor o igual a 1.';
  if (form.position.trim() && !isIntegerAtLeast(form.position, 0)) errors.position = 'La posicion debe ser un entero mayor o igual a 0.';
  if (form.title.trim().length < 2) errors.title = 'El titulo debe tener al menos 2 caracteres.';
  if (form.durationSec.trim() && !isIntegerAtLeast(form.durationSec, 0)) errors.durationSec = 'La duracion debe ser un entero mayor o igual a 0.';
  if (form.publishedAt && !serializeDateFromInput(form.publishedAt)) errors.publishedAt = 'La fecha de publicacion no es valida.';
  return errors;
}

export function episodeFormToUpdatePayload(form: EpisodeFormState, hasReadyVideo: boolean): UpdateEpisodePayload {
  const usesJob = Boolean(form.processingJobId && form.processingJobStatus !== 'MISSING' && (form.videoMode === 'UPLOAD' || form.videoMode === 'AVAILABLE'));
  const usesUrl = form.videoMode === 'URL' && Boolean(form.videoUrl.trim());
  return {
    seasonId: form.seasonId,
    episodeNumber: optionalNumber(form.number),
    position: optionalNumber(form.position),
    title: form.title.trim(),
    description: form.description.trim(),
    processingJobId: usesJob ? form.processingJobId : undefined,
    videoSource: usesUrl ? form.videoSource : undefined,
    videoType: usesUrl ? form.videoType : undefined,
    videoUrl: usesUrl ? form.videoUrl.trim() : undefined,
    originalVideoUrl: usesUrl ? optionalString(form.originalVideoUrl) : undefined,
    processedVideoUrl: usesUrl ? optionalString(form.processedVideoUrl) : undefined,
    thumbnailUrl: optionalString(form.thumbnailUrl),
    durationSec: optionalNumber(form.durationSec),
    introStartSec: nullableNumber(form.introStartSec),
    introEndSec: nullableNumber(form.introEndSec),
    recapStartSec: nullableNumber(form.recapStartSec),
    recapEndSec: nullableNumber(form.recapEndSec),
    published: form.published && hasReadyVideo,
    publishedAt: serializeDateFromInput(form.publishedAt),
  };
}

export function episodeEditorErrorMessage(error: unknown) {
  if (isApiFailure(error)) {
    if (error.status === 404) return 'El episodio ya no existe.';
    if (error.status === 403) return 'No tienes permisos para editar este episodio.';
    if (error.status === 400) return error.message || 'Los datos del episodio no son validos.';
    if (error.status >= 500 || error.status === 0) return 'No se pudo cargar el episodio.';
  }
  return error instanceof Error && error.message ? error.message : 'No se pudo cargar el episodio.';
}

function isApiFailure(error: unknown): error is Error & { status: number } {
  return error instanceof Error && 'status' in error && typeof error.status === 'number';
}

function inferVideoType(url: string): { videoSource: VideoSource; videoType: VideoType } {
  if (/\.m3u8(?:$|[?#])/i.test(url)) return { videoSource: 'HLS', videoType: 'HLS' };
  if (/^https:\/\/(?:drive|docs)\.google\.com\//i.test(url)) return { videoSource: 'DRIVE', videoType: 'DRIVE' };
  if (/^\/(?:uploads|api\/storage\/objects)\//i.test(url)) return { videoSource: 'LOCAL', videoType: 'MP4' };
  return { videoSource: 'URL', videoType: 'MP4' };
}

function stringValue(value: unknown) { return typeof value === 'string' ? value : ''; }
function numberValue(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''; }
function optionalString(value: string) { return value.trim() || undefined; }
function optionalNumber(value: string) { const parsed = Number(value); return value.trim() && Number.isFinite(parsed) ? parsed : undefined; }
function nullableNumber(value: string) { return optionalNumber(value) ?? null; }
export function normalizeDateForInput(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

export function serializeDateFromInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : parsed.toISOString();
}

function isIntegerAtLeast(value: string, minimum: number) {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum;
}
