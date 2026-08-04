import { VideoSource, VideoType } from '../../types/models';

export const statusLabels: Record<string, string> = {
  AIRING: 'En emision', FINISHED: 'Finalizada', PAUSED: 'Pausada',
  DRAFT: 'Borrador', PUBLISHED: 'Publicada', HIDDEN: 'Oculta',
  QUEUED: 'En cola', PROCESSING: 'Procesando', COMPLETED: 'Completado',
  FAILED: 'Error', PENDING: 'Pendiente', CANCELLED: 'Cancelado',
  USER: 'Usuario', ADMIN: 'Administrador', LOCAL: 'Local', URL: 'URL externa',
  HLS: 'HLS', DRIVE: 'Google Drive', EMBED: 'Embed', MP4: 'MP4',
};

export const fieldLabels: Record<string, string> = {
  title: 'Titulo', name: 'Nombre', year: 'Ano', releaseYear: 'Ano', status: 'Estado',
  number: 'Numero', position: 'Posicion', duration: 'Duracion', videoType: 'Video',
  role: 'Rol', active: 'Activo', email: 'Email', slug: 'Slug', featured: 'Destacada',
  episodes: 'Episodios', temporadas: 'Temporadas', estado: 'Estado', updatedAt: 'Actualizacion',
};

export function statusLabel(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (typeof value !== 'string') return String(value ?? '');
  return statusLabels[value] ?? value;
}

export function fieldLabel(value: string) {
  return fieldLabels[value] ?? value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

export type MarkerValues = { durationSec: string; introStartSec: string; introEndSec: string; recapStartSec: string; recapEndSec: string };

export function validatePlaybackMarkers(values: MarkerValues) {
  const errors: Record<string, string> = {};
  const duration = values.durationSec ? Number(values.durationSec) : null;
  const pairs = [['introStartSec', 'introEndSec', 'introduccion'], ['recapStartSec', 'recapEndSec', 'resumen']] as const;
  for (const [startKey, endKey, label] of pairs) {
    const startRaw = values[startKey];
    const endRaw = values[endKey];
    if ((startRaw && !endRaw) || (!startRaw && endRaw)) {
      errors[endRaw ? startKey : endKey] = `Completa el inicio y el fin de ${label}.`;
      continue;
    }
    if (!startRaw && !endRaw) continue;
    const start = Number(startRaw);
    const end = Number(endRaw);
    if (start < 0) errors[startKey] = 'El valor no puede ser negativo.';
    if (end < 0) errors[endKey] = 'El valor no puede ser negativo.';
    if (start >= end) errors[endKey] = `El fin de ${label} debe ser mayor que el inicio.`;
    if (duration !== null && Number.isFinite(duration) && end > duration) errors[endKey] = `El fin de ${label} no puede superar la duracion.`;
  }
  return errors;
}

export function formatBytes(value: string | null) {
  if (value === null) return 'No disponible';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

export function videoTypeForSource(source: VideoSource): VideoType {
  if (source === 'HLS') return 'HLS';
  if (source === 'DRIVE') return 'DRIVE';
  if (source === 'EMBED') return 'EMBED';
  return 'MP4';
}
