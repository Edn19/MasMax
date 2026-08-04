export type ProgressPayload = {
  episodeId?: string;
  movieId?: string;
  positionSec: number;
  durationSec: number;
  completed: boolean;
};

const KEY = 'masmax:pending-progress';

export function storePendingProgress(payload: ProgressPayload) {
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function readPendingProgress(): ProgressPayload | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ProgressPayload;
    if (Boolean(value.episodeId) === Boolean(value.movieId) || !Number.isFinite(value.positionSec) || !Number.isFinite(value.durationSec)) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearPendingProgress(payload: ProgressPayload) {
  const current = readPendingProgress();
  if (!current) return;
  const sameTarget = current.episodeId === payload.episodeId && current.movieId === payload.movieId;
  if (sameTarget && current.positionSec <= payload.positionSec) localStorage.removeItem(KEY);
}
