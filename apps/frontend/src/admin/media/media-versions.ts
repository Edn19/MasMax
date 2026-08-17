export type MediaVersionStatus = 'AVAILABLE' | 'QUEUED' | 'PROCESSING' | 'FAILED' | 'NOT_GENERATED' | 'MISSING';

type ProcessingStatus = 'NONE' | 'ORIGINAL' | 'QUEUED' | 'PROCESSING' | 'READY' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type MediaVersionsInput = {
  extension?: string | null;
  originalUrl?: string | null;
  originalAvailable?: boolean;
  originalMissing?: boolean;
  remuxUrl?: string | null;
  remuxStatus?: ProcessingStatus | null;
  remuxProgress?: number | null;
  remuxMissing?: boolean;
  hlsUrl?: string | null;
  hlsStatus?: ProcessingStatus | null;
  hlsProgress?: number | null;
  hlsMissing?: boolean;
};

export type MediaVersion = {
  kind: 'ORIGINAL' | 'REMUX' | 'HLS';
  title: string;
  format: string;
  status: MediaVersionStatus;
  progress: number | null;
  available: boolean;
  label: string;
};

export function getMediaVersions(media: MediaVersionsInput): Record<MediaVersion['kind'], MediaVersion> {
  const originalAvailable = Boolean(media.originalUrl) && media.originalAvailable !== false && !media.originalMissing;
  const originalStatus: MediaVersionStatus = originalAvailable ? 'AVAILABLE' : 'MISSING';
  return {
    ORIGINAL: version('ORIGINAL', 'Original', media.extension?.replace(/^\./, '').toUpperCase() || 'Archivo', originalStatus, null),
    REMUX: processedVersion('REMUX', 'MP4 Remux', 'MP4', media.remuxUrl, media.remuxStatus, media.remuxProgress, media.remuxMissing),
    HLS: processedVersion('HLS', 'HLS', 'M3U8', media.hlsUrl, media.hlsStatus, media.hlsProgress, media.hlsMissing),
  };
}

export function mediaCompatibilityMessage(media: MediaVersionsInput & { directPlaybackCompatible?: boolean }) {
  const versions = getMediaVersions(media);
  if (media.directPlaybackCompatible && versions.ORIGINAL.available) return 'Archivo original compatible para reproduccion directa.';
  if (versions.REMUX.available && versions.HLS.available) return 'MP4 y HLS disponibles. Selecciona la fuente de publicacion.';
  if (versions.REMUX.available) return 'El archivo original tiene compatibilidad web limitada. Hay una version MP4 compatible disponible para reproduccion.';
  if (versions.HLS.available) return 'El archivo original tiene compatibilidad web limitada. Hay una version HLS disponible para reproduccion.';
  return 'Compatibilidad web limitada. Se recomienda crear MP4 compatible o HLS.';
}

function processedVersion(kind: 'REMUX' | 'HLS', title: string, format: string, url?: string | null, status?: ProcessingStatus | null, progress?: number | null, missing?: boolean) {
  let resolved: MediaVersionStatus;
  if (missing || (url && status !== 'QUEUED' && status !== 'PROCESSING' && !url.trim())) resolved = 'MISSING';
  else if (url) resolved = 'AVAILABLE';
  else if (status === 'QUEUED') resolved = 'QUEUED';
  else if (status === 'PROCESSING') resolved = 'PROCESSING';
  else if (status === 'FAILED' || status === 'CANCELLED') resolved = 'FAILED';
  else resolved = 'NOT_GENERATED';
  return version(kind, title, format, resolved, progress ?? null);
}

function version(kind: MediaVersion['kind'], title: string, format: string, status: MediaVersionStatus, progress: number | null): MediaVersion {
  const label = status === 'AVAILABLE' ? 'Disponible'
    : status === 'QUEUED' ? 'En cola'
      : status === 'PROCESSING' ? `Procesando ${Math.round(progress ?? 0)}%`
        : status === 'FAILED' ? 'Error'
          : status === 'MISSING' ? 'Archivo faltante'
            : 'No generado';
  return { kind, title, format, status, progress, available: status === 'AVAILABLE', label };
}
