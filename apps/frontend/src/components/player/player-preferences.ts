export type PlayerPreferences = {
  volume: number;
  speed: number;
  quality: number | 'auto';
  autoplayNext: boolean;
};

export const defaultPlayerPreferences: PlayerPreferences = {
  volume: 1,
  speed: 1,
  quality: 'auto',
  autoplayNext: true,
};

const storageKey = 'masmax.player.preferences';
const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function normalizePlayerPreferences(value: unknown): PlayerPreferences {
  if (!value || typeof value !== 'object') return defaultPlayerPreferences;
  const candidate = value as Partial<PlayerPreferences>;
  const volume = typeof candidate.volume === 'number' && Number.isFinite(candidate.volume)
    ? Math.min(1, Math.max(0, candidate.volume))
    : defaultPlayerPreferences.volume;
  const speed = typeof candidate.speed === 'number' && speeds.includes(candidate.speed)
    ? candidate.speed
    : defaultPlayerPreferences.speed;
  const quality = candidate.quality === 'auto' || (typeof candidate.quality === 'number' && candidate.quality > 0)
    ? candidate.quality
    : defaultPlayerPreferences.quality;
  return {
    volume,
    speed,
    quality,
    autoplayNext: typeof candidate.autoplayNext === 'boolean' ? candidate.autoplayNext : defaultPlayerPreferences.autoplayNext,
  };
}

export function loadPlayerPreferences(): PlayerPreferences {
  try {
    return normalizePlayerPreferences(JSON.parse(localStorage.getItem(storageKey) ?? 'null'));
  } catch {
    return defaultPlayerPreferences;
  }
}

export function savePlayerPreferences(preferences: PlayerPreferences) {
  localStorage.setItem(storageKey, JSON.stringify(normalizePlayerPreferences(preferences)));
}

export const playbackSpeeds = speeds;
