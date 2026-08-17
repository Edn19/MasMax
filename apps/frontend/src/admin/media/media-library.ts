export type AdminMediaStatus = 'UPLOADING' | 'ORIGINAL' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNASSIGNED';
export type AdminMediaContentType = 'EPISODE' | 'MOVIE' | 'UNASSIGNED' | 'UPLOAD';

export type AdminMediaItem = {
  id: string;
  entity: 'JOB' | 'UPLOAD' | 'FILE';
  contentType: AdminMediaContentType;
  contentId: string | null;
  mediaFileId?: string | null;
  title: string;
  contentUrl: string | null;
  originalName: string | null;
  extension?: string | null;
  status: AdminMediaStatus;
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

export type AdminMediaResponse = {
  items: AdminMediaItem[];
  total: number;
  page: number;
  limit: number;
  summary: { active: number; completed: number; failed: number; cancelled: number; unassigned: number; published: number; drafts: number; originalBytes: string; remuxBytes: string; hlsBytes: string; totalBytes: string };
};

export const mediaStatusLabels: Record<AdminMediaStatus, string> = {
  UPLOADING: 'Subiendo', ORIGINAL: 'Original sin procesar', QUEUED: 'En cola', PROCESSING: 'Procesando', COMPLETED: 'Listo', FAILED: 'Fallido', CANCELLED: 'Cancelado', UNASSIGNED: 'Sin asignar',
};

export function mediaStatusTone(status: AdminMediaStatus) {
  if (status === 'COMPLETED') return 'border-mint/40 bg-mint/10 text-mint';
  if (status === 'ORIGINAL') return 'border-warning/40 bg-warning/10 text-warning';
  if (status === 'FAILED') return 'border-coral/40 bg-coral/10 text-coral';
  if (status === 'CANCELLED') return 'border-slate-500/40 bg-slate-500/10 text-slate-300';
  if (status === 'UNASSIGNED') return 'border-warning/40 bg-warning/10 text-warning';
  return 'border-brand/40 bg-brand/10 text-brand';
}

export function destructiveMediaCopy(kind: 'CANCEL' | 'HLS' | 'REMUX' | 'ORIGINAL' | 'ASSET', item: AdminMediaItem) {
  if (kind === 'CANCEL') return { title: 'Cancelar procesamiento', confirmLabel: 'Cancelar proceso', description: 'Se solicitara detener FFmpeg de forma segura. El archivo original se conservara.' };
  if (kind === 'ORIGINAL') return { title: 'Eliminar archivo original', confirmLabel: 'Eliminar original', description: 'Esta accion no se puede deshacer. El HLS generado se conservara, pero el archivo original no podra recuperarse ni reprocesarse.' };
  if (kind === 'REMUX') return { title: 'Eliminar MP4 remux', confirmLabel: 'Eliminar remux', description: `Se eliminara solo el MP4 remux (${item.remuxSize ?? 'tamano no disponible'} bytes). El original y HLS se conservaran.` };
  if (kind === 'ASSET') return { title: 'Eliminar activo completo', confirmLabel: 'Eliminar todo', description: 'Se eliminaran original, remux y HLS. La operacion se bloqueara si existe una asociacion o procesamiento activo.' };
  return { title: 'Eliminar HLS', confirmLabel: 'Eliminar HLS', description: `Se eliminaran playlists, segmentos y variantes (${item.hlsSize ?? 'tamano no disponible'} bytes). El archivo original no sera eliminado y el contenido quedara despublicado.` };
}
