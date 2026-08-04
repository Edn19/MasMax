const standardProfiles = [360, 480, 720, 1080];

export function selectVideoProfiles(sourceHeight: number, configured: string) {
  const requested = configured.split(',').map(Number).filter((height) => standardProfiles.includes(height));
  const profiles = [...new Set(requested)].filter((height) => height <= sourceHeight).sort((left, right) => left - right);
  if (profiles.length) return profiles;
  const sourceProfile = Math.max(2, Math.floor(sourceHeight / 2) * 2);
  return [sourceProfile];
}

export function scaledWidth(sourceWidth: number, sourceHeight: number, targetHeight: number) {
  return Math.max(2, Math.floor(sourceWidth * targetHeight / sourceHeight / 2) * 2);
}

export function profileBandwidth(height: number) {
  if (height >= 1080) return 5_500_000;
  if (height >= 720) return 3_000_000;
  if (height >= 480) return 1_500_000;
  return 800_000;
}

export function masterPlaylist(sourceWidth: number, sourceHeight: number, profiles: number[], baseUrl = '') {
  const prefix = baseUrl ? `${baseUrl.replace(/\/$/, '')}/` : '';
  const variants = profiles.map((height) => `#EXT-X-STREAM-INF:BANDWIDTH=${profileBandwidth(height)},RESOLUTION=${scaledWidth(sourceWidth, sourceHeight, height)}x${height}\n${prefix}${height}/index.m3u8`);
  return ['#EXTM3U', '#EXT-X-VERSION:3', ...variants, ''].join('\n');
}

export function absoluteSegmentPlaylist(content: string, baseUrl: string) {
  const prefix = baseUrl.replace(/\/$/, '');
  return content.split(/\r?\n/).map((line) => /^segment-\d{5}\.ts$/.test(line) ? `${prefix}/${line}` : line).join('\n');
}
