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

export function episodePublicationPresentation(episode: Pick<Episode, 'published' | 'publicationState' | 'playbackReadiness'>) {
  const state = episode.publicationState ?? (episode.published ? 'PUBLISHED' : 'DRAFT');
  if (state === 'PUBLISHED') return { label: 'Publicado y reproducible', detail: 'Visible en el catálogo público.', tone: 'text-mint' };
  if (state === 'PUBLISHED_HIDDEN') return { label: 'Publicado pero oculto', detail: 'La temporada no está publicada.', tone: 'text-warning' };
  if (state === 'PUBLISHED_UNAVAILABLE') return { label: 'Publicado pero video no disponible', detail: episode.playbackReadiness?.message ?? 'La fuente seleccionada no está disponible.', tone: 'text-coral' };
  if (state === 'PROCESSING') return { label: 'Procesando video', detail: episode.playbackReadiness?.message ?? 'La fuente seleccionada todavía se está generando.', tone: 'text-warning' };
  if (state === 'READY') return { label: 'Video listo', detail: 'La fuente es reproducible; el episodio permanece como borrador.', tone: 'text-brand' };
  return { label: 'Borrador', detail: episode.playbackReadiness?.message ?? 'El episodio no está publicado.', tone: 'text-slate-400' };
}

export function episodeDeleteLabel(episode: Pick<Episode, 'number' | 'title' | 'series' | 'season'>) {
  return `${episode.series?.title ?? 'Serie sin nombre'} · Temporada ${episode.season?.number ?? '?'} · E${episode.number}. ${episode.title}`;
}
