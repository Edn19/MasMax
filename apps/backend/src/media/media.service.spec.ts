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
  const service = new MediaService(prisma as never, config as never);
  it('genera y valida una URL temporal para MP4 local', async () => {
    const result = await service.authorize('user', 'session', { episodeId: 'episode' });
    expect(result.protected).toBe(true);
    const query = Object.fromEntries(new URL(result.url, 'http://local').searchParams.entries());
    await expect(service.validateAndLog(query)).resolves.toBe('/protected-media/videos/demo.mp4');
  });
  it('rechaza una URL vencida', async () => {
    await expect(service.validateAndLog({ uid:'u',sid:'s',path:'videos/demo.mp4',exp:'1',eid:'e',mid:'',sig:'x' })).rejects.toThrow('vencido');
  });
});
