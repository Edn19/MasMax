import { BadRequestException } from '@nestjs/common';

export type PlaybackMarkers = {
  introStartSec?: number | null;
  introEndSec?: number | null;
  recapStartSec?: number | null;
  recapEndSec?: number | null;
};

export function validatePlaybackMarkers(markers: PlaybackMarkers, durationSec?: number | null) {
  validatePair('introduccion', markers.introStartSec, markers.introEndSec, durationSec);
  validatePair('resumen', markers.recapStartSec, markers.recapEndSec, durationSec);
  if (markers.introEndSec != null && markers.recapStartSec != null && markers.recapStartSec < markers.introEndSec) {
    throw new BadRequestException('El resumen no puede comenzar antes de que termine la introduccion');
  }
}

function validatePair(label: string, start?: number | null, end?: number | null, durationSec?: number | null) {
  const hasStart = start != null;
  const hasEnd = end != null;
  if (hasStart !== hasEnd) throw new BadRequestException(`Define inicio y fin de ${label}, o deja ambos vacios`);
  if (!hasStart || !hasEnd) return;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0) throw new BadRequestException(`Los marcadores de ${label} deben ser segundos enteros positivos`);
  if (end <= start) throw new BadRequestException(`El fin de ${label} debe ser posterior al inicio`);
  if (durationSec && end > durationSec) throw new BadRequestException(`El fin de ${label} supera la duracion del contenido`);
}
