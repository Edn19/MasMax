import { Prisma, VideoProcessingStatus, VideoProcessingTargetType, VideoSource, VideoType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpisodesService } from './episodes.service';

describe('EpisodesService editing', () => {
  const current = {
    id: 'episode-1', seriesId: 'series-1', seasonId: 'season-1', number: 1, position: 1, title: 'Original', description: '',
    videoUrl: 'https://media.example/episode.mp4', originalVideoUrl: 'https://media.example/episode.mp4', processedVideoUrl: null, mediaFileId: null,
    videoSource: VideoSource.URL, videoType: VideoType.MP4, thumbnailUrl: null, durationSec: 120,
    introStartSec: null, introEndSec: null, recapStartSec: null, recapEndSec: null, published: false,
  };
  const tx = {
    episode: { update: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), findUniqueOrThrow: vi.fn() },
    videoProcessingJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    subtitleTrack: { count: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    episode: { findFirst: vi.fn() },
    season: { findFirst: vi.fn() },
    mediaFile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const service = new EpisodesService(prisma as never, { publicUrl: vi.fn((path: string) => `/uploads/${path}`) } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.episode.findFirst.mockResolvedValue(current);
    prisma.season.findFirst.mockResolvedValue({ id: 'season-2', seriesId: 'series-2' });
    tx.episode.update.mockResolvedValue({ ...current, seasonId: 'season-2', seriesId: 'series-2' });
    tx.episode.findFirst.mockResolvedValue(null);
    tx.episode.aggregate.mockResolvedValue({ _min: { number: 1 } });
    tx.episode.findUniqueOrThrow.mockResolvedValue({ ...current, seasonId: 'season-2', seriesId: 'series-2' });
    tx.videoProcessingJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it('conserva el video y deriva la serie al cambiar de temporada', async () => {
    await service.update('episode-1', { seasonId: 'season-2', title: 'Actualizado' }, 'admin-1');
    expect(tx.videoProcessingJob.findUnique).not.toHaveBeenCalled();
    expect(tx.episode.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ seriesId: 'series-2', seasonId: 'season-2', videoUrl: current.videoUrl, videoSource: VideoSource.URL, videoType: VideoType.MP4 }) }));
  });

  it('no revalida referencias HLS historicas al editar solo metadatos', async () => {
    prisma.episode.findFirst.mockResolvedValueOnce({
      ...current,
      videoUrl: '/uploads/hls/job-legacy/master.m3u8',
      originalVideoUrl: '/uploads/videos/original-legacy.mkv',
      processedVideoUrl: '/uploads/hls/job-legacy/master.m3u8',
      videoSource: VideoSource.HLS,
      videoType: VideoType.HLS,
    });

    await expect(service.update('episode-1', { title: 'Solo metadatos' }, 'admin-1')).resolves.toBeTruthy();
    expect(tx.episode.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        videoUrl: '/uploads/hls/job-legacy/master.m3u8',
        originalVideoUrl: '/uploads/videos/original-legacy.mkv',
        videoSource: VideoSource.HLS,
        videoType: VideoType.HLS,
      }),
    }));
  });

  it.each([true, false])('actualiza published=%s sin perder temporada ni video', async (published) => {
    await service.update('episode-1', { published }, 'admin-1');
    expect(tx.episode.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        seriesId: 'series-2',
        seasonId: 'season-1',
        published,
        videoUrl: current.videoUrl,
        videoSource: VideoSource.URL,
        videoType: VideoType.MP4,
      }),
    }));
    expect(tx.videoProcessingJob.updateMany).not.toHaveBeenCalled();
  });

  it('respeta duracion y fecha editadas aunque el episodio conserve un job HLS', async () => {
    tx.videoProcessingJob.findUnique.mockResolvedValue({
      id: 'job-1', requestedById: 'admin-1', status: VideoProcessingStatus.COMPLETED, targetType: VideoProcessingTargetType.EPISODE,
      targetId: 'episode-1', masterPath: 'hls/job-1/master.m3u8', thumbnailPath: 'images/job-1.jpg', durationSec: 120,
      processingStage: 'COMPLETED', subtitleTracks: [], inputMediaFile: { relativePath: 'videos/original.mkv' },
    });

    await service.update('episode-1', { processingJobId: 'job-1', durationSec: 1800, publishedAt: '2026-08-08T00:00:00.000Z' }, 'admin-1');

    expect(tx.episode.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        durationSec: 1800,
        publishedAt: new Date('2026-08-08T00:00:00.000Z'),
        videoUrl: '/uploads/hls/job-1/master.m3u8',
      }),
    }));
  });

  it('devuelve 404 al editar un episodio inexistente', async () => {
    prisma.episode.findFirst.mockResolvedValueOnce(null);
    await expect(service.update('missing', { published: true }, 'admin-1')).rejects.toThrow('Episodio no encontrado');
    expect(tx.episode.update).not.toHaveBeenCalled();
  });

  it('desvincula el video sin eliminar archivos multimedia', async () => {
    await service.update('episode-1', { mediaFileId: null, videoUrl: '', published: false }, 'admin-1');
    expect(tx.episode.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mediaFileId: null, videoUrl: null, originalVideoUrl: null, processedVideoUrl: null, published: false }) }));
    expect(tx.videoProcessingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { targetType: null, targetId: null, associatedAt: null } }));
  });

  it('traduce un numero duplicado dentro de la temporada', async () => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }));
    await expect(service.update('episode-1', { seasonId: 'season-2', episodeNumber: 1 }, 'admin-1')).rejects.toThrow('numero para la temporada');
  });

  it('libera un numero ocupado por un episodio archivado antes de editar', async () => {
    tx.episode.findFirst.mockResolvedValueOnce({ id: 'episode-archived' });
    tx.episode.aggregate.mockResolvedValueOnce({ _min: { number: 1 } });

    await service.update('episode-1', { episodeNumber: 2 }, 'admin-1');

    expect(tx.episode.update).toHaveBeenNthCalledWith(1, { where: { id: 'episode-archived' }, data: { number: -1 } });
    expect(tx.videoProcessingJob.updateMany).toHaveBeenCalledWith({
      where: { targetType: VideoProcessingTargetType.EPISODE, targetId: 'episode-archived' },
      data: { targetType: null, targetId: null, associatedAt: null },
    });
  });

  it('archiva al eliminar y conserva los archivos mientras libera el trabajo', async () => {
    prisma.episode.findFirst.mockResolvedValueOnce({ id: 'episode-1', seasonId: 'season-1' });
    tx.episode.aggregate.mockResolvedValueOnce({ _min: { number: 1 } });

    await service.remove('episode-1');

    expect(tx.episode.update).toHaveBeenCalledWith({
      where: { id: 'episode-1' },
      data: { number: -1, deletedAt: expect.any(Date), published: false },
    });
    expect(tx.videoProcessingJob.updateMany).toHaveBeenCalledWith({
      where: { targetType: VideoProcessingTargetType.EPISODE, targetId: 'episode-1' },
      data: { targetType: null, targetId: null, associatedAt: null },
    });
  });

  it('devuelve 404 al eliminar un episodio inexistente', async () => {
    prisma.episode.findFirst.mockResolvedValueOnce(null);
    await expect(service.remove('missing')).rejects.toThrow('Episodio no encontrado');
  });
});
