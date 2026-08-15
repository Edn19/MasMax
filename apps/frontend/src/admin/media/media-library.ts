export type AdminMediaStatus = 'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNASSIGNED';
export type AdminMediaContentType = 'EPISODE' | 'MOVIE' | 'UNASSIGNED' | 'UPLOAD';

export type AdminMediaItem = {
  id: string;
  entity: 'JOB' | 'UPLOAD' | 'FILE';
  contentType: AdminMediaContentType;
  contentId: string | null;
  title: string;
  contentUrl: string | null;
  originalName: string | null;
  status: AdminMediaStatus;
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

export type AdminMediaResponse = {
  items: AdminMediaItem[];
  total: number;
  page: number;
  limit: number;
  summary: { active: number; completed: number; failed: number; cancelled: number; unassigned: number; published: number; drafts: number };
};

export const mediaStatusLabels: Record<AdminMediaStatus, string> = {
  UPLOADING: 'Subiendo', QUEUED: 'En cola', PROCESSING: 'Procesando', COMPLETED: 'Listo', FAILED: 'Fallido', CANCELLED: 'Cancelado', UNASSIGNED: 'Sin asignar',
};

export function mediaStatusTone(status: AdminMediaStatus) {
  if (status === 'COMPLETED') return 'border-mint/40 bg-mint/10 text-mint';
  if (status === 'FAILED') return 'border-coral/40 bg-coral/10 text-coral';
  if (status === 'CANCELLED') return 'border-slate-500/40 bg-slate-500/10 text-slate-300';
  if (status === 'UNASSIGNED') return 'border-warning/40 bg-warning/10 text-warning';
  return 'border-brand/40 bg-brand/10 text-brand';
}

export function destructiveMediaCopy(kind: 'CANCEL' | 'HLS' | 'ORIGINAL', item: AdminMediaItem) {
  if (kind === 'CANCEL') return { title: 'Cancelar procesamiento', confirmLabel: 'Cancelar proceso', description: 'Se solicitara detener FFmpeg de forma segura. El archivo original se conservara.' };
  if (kind === 'ORIGINAL') return { title: 'Eliminar archivo original', confirmLabel: 'Eliminar original', description: 'Esta accion no se puede deshacer. El HLS generado se conservara, pero el archivo original no podra recuperarse ni reprocesarse.' };
  return { title: 'Eliminar HLS', confirmLabel: 'Eliminar HLS', description: `Se eliminaran playlists, segmentos y variantes (${item.hlsSize ?? 'tamano no disponible'} bytes). El archivo original no sera eliminado y el contenido quedara despublicado.` };
}
