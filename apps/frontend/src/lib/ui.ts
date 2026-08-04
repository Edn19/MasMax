export function isNavigationPathActive(currentPath: string, targetPath: string, exact = false) {
  if (exact) return currentPath === targetPath;
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function boundedPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function siteDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+version\s+\d+(?:\.\d+){0,2}$/i, '').trim();
  return normalized || 'MasMax';
}
