import { EpisodeProcessingJob } from '../../types/models';

export type EpisodeVideoMode = 'UPLOAD' | 'AVAILABLE' | 'URL' | 'NONE';

export function episodeVideoIsReady(videoUrl: string, job?: EpisodeProcessingJob) {
  return Boolean(videoUrl.trim() || job?.status === 'COMPLETED');
}

export function episodeVideoError(mode: EpisodeVideoMode, videoUrl: string, processingJobId: string, mediaFileId = '') {
  if (mode === 'AVAILABLE' && !processingJobId && !mediaFileId) return 'Selecciona un archivo cargado.';
  if (mode === 'URL' && !videoUrl.trim()) return 'Agrega una URL de video.';
  return undefined;
}

export function persistentVideoReference(mode: EpisodeVideoMode, processingJobId: string, videoUrl: string, mediaFileId = '') {
  if ((mode === 'UPLOAD' || mode === 'AVAILABLE') && mediaFileId) return { mediaFileId };
  if ((mode === 'UPLOAD' || mode === 'AVAILABLE') && processingJobId) return { processingJobId };
  if (mode === 'URL' && videoUrl.trim()) return { videoUrl: videoUrl.trim() };
  return {};
}
