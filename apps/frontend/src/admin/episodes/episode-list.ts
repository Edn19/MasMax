import { Episode } from '../../types/models';

export type EpisodePublishedFilter = 'ALL' | 'PUBLISHED' | 'DRAFT';
export type EpisodeVideoFilter = 'ALL' | 'READY' | 'MISSING';

export function buildEpisodeListQuery(filters: {
  seriesId: string;
  seasonId: string;
  search: string;
  published: EpisodePublishedFilter;
  video: EpisodeVideoFilter;
  page: number;
  limit: number;
}) {
  const params = new URLSearchParams({
    seriesId: filters.seriesId,
    seasonId: filters.seasonId,
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.published !== 'ALL') params.set('published', String(filters.published === 'PUBLISHED'));
  if (filters.video !== 'ALL') params.set('videoState', filters.video);
  return params.toString();
}

export function episodePageCount(total: number, limit: number) {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

export function episodeProcessingLabel(episode: Pick<Episode, 'videoUrl' | 'processingJob'> & Partial<Pick<Episode, 'mediaFileId'>>) {
  const kind = episode.processingJob?.kind === 'REMUX' ? 'MP4 remux' : episode.processingJob?.kind === 'HLS' ? 'HLS' : 'Video';
  if (episode.processingJob?.status === 'FAILED') return `${kind}: fallo`;
  if (episode.processingJob?.status === 'CANCELLED') return `${kind}: cancelado`;
  if (episode.processingJob?.status === 'PROCESSING') return `${kind}: procesando ${episode.processingJob.progress}%`;
  if (episode.processingJob?.status === 'QUEUED') return `${kind}: en cola`;
  return episode.mediaFileId || episode.videoUrl ? 'Sin proceso activo' : 'Sin video';
}

export function episodeDeleteLabel(episode: Pick<Episode, 'number' | 'title' | 'series' | 'season'>) {
  return `${episode.series?.title ?? 'Serie sin nombre'} · Temporada ${episode.season?.number ?? '?'} · E${episode.number}. ${episode.title}`;
}
