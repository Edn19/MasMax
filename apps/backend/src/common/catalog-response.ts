const privateMediaFields = new Set(['videoUrl', 'originalVideoUrl', 'processedVideoUrl', 'storageName', 'relativePath']);

export function toCatalogResponse<T>(value: T): T {
  return sanitize(value) as T;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !privateMediaFields.has(key))
      .map(([key, entry]) => [key, sanitize(entry)]),
  );
}
