import { describe, expect, it, vi } from 'vitest';
import { MediaService } from './media.service';

describe('MediaService', () => {
  const prisma = {
    episode: { findFirst: vi.fn().mockResolvedValue({ videoUrl: '/uploads/videos/demo.mp4' }) },
    movie: { findFirst: vi.fn() },
    session: { findFirst: vi.fn().mockResolvedValue({ id: 'session' }) },
    viewLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const config = { get: vi.fn((key:string) => key === 'MEDIA_URL_EXPIRES_SECONDS' ? '300' : undefined), getOrThrow: vi.fn(() => 'a-secure-media-secret-with-32-chars') };
  const storage = { driverName: 'local', keyFromUrl: vi.fn((url: string) => url.replace(/^\/uploads\//, '')), exists: vi.fn().mockResolvedValue(true), read: vi.fn().mockResolvedValue(Buffer.from('#EXTM3U\n720/index.m3u8')) };
  const service = new MediaService(prisma as never, config as never, storage as never);
  it('genera y valida una URL temporal para MP4 local', async () => {
    const result = await service.authorize('user', 'session', { episodeId: 'episode' });
    expect(result.protected).toBe(true);
    const query = Object.fromEntries(new URL(result.url, 'http://local').searchParams.entries());
    await expect(service.validateAndLog(query)).resolves.toBe('/protected-media/videos/demo.mp4');
  });
  it('rechaza una URL vencida', async () => {
    await expect(service.validateAndLog({ uid:'u',sid:'s',path:'videos/demo.mp4',exp:'1',eid:'e',mid:'',sig:'x' })).rejects.toThrow('vencido');
  });

  it('protege HLS local con una URL temporal firmada', async () => {
    prisma.episode.findFirst.mockResolvedValueOnce({ videoUrl: '/uploads/hls/job123/master.m3u8' });
    const result = await service.authorize('user', 'session', { episodeId: 'episode' });
    expect(result.protected).toBe(true);
    expect(result.url).toMatch(/^\/api\/media\/hls\?/);
    const params = Object.fromEntries(new URL(result.url, 'http://local').searchParams.entries());
    const manifest = await service.deliverHls(params);
    expect(manifest).toMatchObject({ kind: 'manifest' });
    if (manifest.kind === 'manifest') expect(manifest.content).toContain('/api/media/hls?token=');
    await expect(service.deliverHls({ ...params, path: '../otro/segment-00001.ts' })).rejects.toThrow('invalida');
    await expect(service.deliverHls({ ...params, token: `${params.token}alterado` })).rejects.toThrow('invalido');
  });
});
