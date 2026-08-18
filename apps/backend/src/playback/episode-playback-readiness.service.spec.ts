import { EpisodePlaybackMode, MediaStatus, VideoProcessingKind, VideoProcessingStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpisodePlaybackReadinessService } from './episode-playback-readiness.service';

function media(overrides: Record<string, unknown> = {}) {
  return {
    id: 'media-1', relativePath: 'videos/original.mp4', extension: '.mp4', sizeBytes: 100n,
    status: MediaStatus.READY, videoCodec: 'h264', audioCodec: 'aac', probeMetadata: null,
    inputJobs: [],
    ...overrides,
  };
}

function job(kind: VideoProcessingKind, status: VideoProcessingStatus, overrides: Record<string, unknown> = {}) {
  const id = kind === VideoProcessingKind.HLS ? 'hls-1' : 'remux-1';
  return {
    id, kind, status, createdAt: new Date(), masterPath: kind === VideoProcessingKind.HLS ? `hls/${id}/master.m3u8` : null,
    outputMediaFile: status === VideoProcessingStatus.COMPLETED
      ? { id: 'output-1', status: MediaStatus.READY, extension: kind === VideoProcessingKind.HLS ? '.m3u8' : '.mp4', sizeBytes: 100n, relativePath: kind === VideoProcessingKind.HLS ? `hls/${id}/master.m3u8` : `videos/${id}.mp4` }
      : null,
    ...overrides,
  };
}

describe('EpisodePlaybackReadinessService', () => {
  const prisma = { episode: { findFirst: vi.fn(), findMany: vi.fn() } };
  const storage = {
    exists: vi.fn().mockResolvedValue(true),
    metadata: vi.fn().mockResolvedValue({ size: 100 }),
    publicUrl: vi.fn((path: string) => `/uploads/${path}`),
    keyFromUrl: vi.fn((url: string) => url.startsWith('/uploads/') ? url.slice('/uploads/'.length) : null),
  };
  const service = new EpisodePlaybackReadinessService(prisma as never, storage as never);

  beforeEach(() => {
    vi.clearAllMocks();
    storage.exists.mockResolvedValue(true);
    storage.metadata.mockResolvedValue({ size: 100 });
  });

  it('acepta un ORIGINAL listo, compatible y no vacio', async () => {
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.ORIGINAL, mediaFileId: 'media-1', media: media() as never })).resolves.toMatchObject({ playable: true, sourceType: 'ORIGINAL', url: '/uploads/videos/original.mp4' });
  });

  it.each([
    [{ status: MediaStatus.PROCESSING }, 'MEDIA_FILE_NOT_READY'],
    [{ sizeBytes: 0n }, 'MEDIA_FILE_EMPTY'],
    [{ extension: '.mkv' }, 'ORIGINAL_NOT_BROWSER_COMPATIBLE'],
  ])('rechaza un ORIGINAL invalido: %s', async (overrides, reason) => {
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.ORIGINAL, mediaFileId: 'media-1', media: media(overrides) as never })).resolves.toMatchObject({ playable: false, reason });
  });

  it('rechaza un ORIGINAL ausente fisicamente', async () => {
    storage.metadata.mockResolvedValueOnce(null);
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.ORIGINAL, mediaFileId: 'media-1', media: media() as never })).resolves.toMatchObject({ playable: false, reason: 'ORIGINAL_FILE_NOT_FOUND' });
  });

  it('acepta REMUX solo con job completado, salida MP4 lista y archivo no vacio', async () => {
    const input = media({ inputJobs: [job(VideoProcessingKind.REMUX, VideoProcessingStatus.COMPLETED)] });
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.REMUX, mediaFileId: 'media-1', media: input as never })).resolves.toMatchObject({ playable: true, url: '/uploads/videos/remux-1.mp4' });
  });

  it('rechaza REMUX completado si el MP4 fue eliminado del storage', async () => {
    storage.exists.mockResolvedValueOnce(false);
    const input = media({ inputJobs: [job(VideoProcessingKind.REMUX, VideoProcessingStatus.COMPLETED)] });
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.REMUX, mediaFileId: 'media-1', media: input as never })).resolves.toMatchObject({ playable: false, reason: 'REMUX_FILE_NOT_FOUND' });
  });

  it('distingue REMUX procesando, fallido y con salida invalida', async () => {
    for (const [status, expected] of [[VideoProcessingStatus.PROCESSING, 'REMUX_PROCESSING'], [VideoProcessingStatus.FAILED, 'REMUX_FAILED']] as const) {
      const result = await service.evaluateSource({ mode: EpisodePlaybackMode.REMUX, mediaFileId: 'media-1', media: media({ inputJobs: [job(VideoProcessingKind.REMUX, status)] }) as never });
      expect(result).toMatchObject({ playable: false, reason: expected, processing: status === VideoProcessingStatus.PROCESSING });
    }
    const invalid = job(VideoProcessingKind.REMUX, VideoProcessingStatus.COMPLETED, { outputMediaFile: { id: 'bad', status: MediaStatus.READY, extension: '.mkv', sizeBytes: 100n, relativePath: 'videos/bad.mkv' } });
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.REMUX, mediaFileId: 'media-1', media: media({ inputJobs: [invalid] }) as never })).resolves.toMatchObject({ reason: 'REMUX_OUTPUT_INVALID' });
  });

  it('valida la ruta exacta y la existencia no vacia de master.m3u8', async () => {
    const valid = media({ inputJobs: [job(VideoProcessingKind.HLS, VideoProcessingStatus.COMPLETED)] });
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.HLS, mediaFileId: 'media-1', media: valid as never })).resolves.toMatchObject({ playable: true, url: '/uploads/hls/hls-1/master.m3u8' });

    const badPath = media({ inputJobs: [job(VideoProcessingKind.HLS, VideoProcessingStatus.COMPLETED, { masterPath: 'hls/otro/master.m3u8' })] });
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.HLS, mediaFileId: 'media-1', media: badPath as never })).resolves.toMatchObject({ reason: 'HLS_MASTER_PATH_INVALID' });

    storage.exists.mockResolvedValueOnce(false);
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.HLS, mediaFileId: 'media-1', media: valid as never })).resolves.toMatchObject({ reason: 'HLS_MASTER_NOT_FOUND' });

    storage.metadata.mockResolvedValueOnce({ size: 0 });
    await expect(service.evaluateSource({ mode: EpisodePlaybackMode.HLS, mediaFileId: 'media-1', media: valid as never })).resolves.toMatchObject({ reason: 'HLS_MASTER_EMPTY' });
  });

  it('calcula estados publicados visibles, ocultos e indisponibles', async () => {
    const ready = await service.evaluateSource({ mode: EpisodePlaybackMode.ORIGINAL, mediaFileId: 'media-1', media: media() as never });
    const unavailable = { ...ready, playable: false, reason: 'ORIGINAL_FILE_NOT_FOUND' as const };
    const visible = { published: true, season: { published: true, deletedAt: null }, series: { deletedAt: null } };
    expect(service.publicationState(visible as never, ready)).toBe('PUBLISHED');
    expect(service.publicationState({ ...visible, season: { published: false, deletedAt: null } } as never, ready)).toBe('PUBLISHED_HIDDEN');
    expect(service.publicationState(visible as never, unavailable)).toBe('PUBLISHED_UNAVAILABLE');
  });

  it('recalcula PUBLISHED_UNAVAILABLE si el archivo se elimina después de publicar', async () => {
    storage.exists.mockResolvedValueOnce(false);
    const readiness = await service.evaluateSource({ mode: EpisodePlaybackMode.ORIGINAL, mediaFileId: 'media-1', media: media() as never });
    expect(service.publicationState({ published: true, season: { published: true, deletedAt: null }, series: { deletedAt: null } } as never, readiness)).toBe('PUBLISHED_UNAVAILABLE');
  });
});
