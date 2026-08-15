import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpisodesService, findMissingEpisodeNumbers } from './episodes.service';

describe('findMissingEpisodeNumbers', () => {
  it('detecta huecos sin repetir numeros', () => {
    expect(findMissingEpisodeNumbers([1, 2, 4, 4, 7])).toEqual({ max: 7, missing: [3, 5, 6] });
  });

  it('ignora numeros invalidos y admite temporadas vacias', () => {
    expect(findMissingEpisodeNumbers([0, -1, 1.5])).toEqual({ max: 0, missing: [] });
    expect(findMissingEpisodeNumbers([])).toEqual({ max: 0, missing: [] });
  });
});

describe('EpisodesService admin detail', () => {
  const prisma = {
    episode: { findFirst: vi.fn() },
    videoProcessingJob: { findFirst: vi.fn() },
  };
  const storage = { publicUrl: vi.fn((path: string) => `/uploads/${path}`) };
  const service = new EpisodesService(prisma as never, storage as never);

  beforeEach(() => vi.clearAllMocks());

  it('devuelve los datos minimos de edicion sin video', async () => {
    prisma.episode.findFirst.mockResolvedValue({ id: 'episode-1', seriesId: 'series-1', seasonId: 'season-1', videoUrl: null, season: { id: 'season-1', seriesId: 'series-1' }, series: { id: 'series-1' }, subtitles: [] });
    prisma.videoProcessingJob.findFirst.mockResolvedValue(null);
    await expect(service.adminById('episode-1')).resolves.toMatchObject({ id: 'episode-1', videoUrl: null, processingJob: null });
  });

  it('incluye el trabajo mas reciente asociado', async () => {
    const createdAt = new Date('2026-08-04T00:00:00.000Z');
    prisma.episode.findFirst.mockResolvedValue({ id: 'episode-1', season: {}, series: {}, subtitles: [] });
    prisma.videoProcessingJob.findFirst.mockResolvedValue({ id: 'job-1', status: 'PROCESSING', progress: 42, processingStage: 'TRANSCODING', targetType: 'EPISODE', targetId: 'episode-1', masterPath: null, thumbnailPath: null, errorMessage: null, createdAt, updatedAt: createdAt, inputMediaFile: { originalName: 'episode.mkv' } });
    await expect(service.adminById('episode-1')).resolves.toMatchObject({ processingJob: { id: 'job-1', status: 'PROCESSING', originalName: 'episode.mkv' } });
  });

  it('responde 404 cuando el episodio ya no existe', async () => {
    prisma.episode.findFirst.mockResolvedValue(null);
    await expect(service.adminById('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.videoProcessingJob.findFirst).not.toHaveBeenCalled();
  });
});
