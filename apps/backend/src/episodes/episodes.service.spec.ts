import { ConflictException, NotFoundException } from '@nestjs/common';
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

describe('EpisodesService bulk publication', () => {
  const episodes = [
    { id: 'episode-1', number: 1, title: 'Piloto', season: { number: 1 } },
    { id: 'episode-2', number: 2, title: 'Continuación', season: { number: 1 } },
  ];
  const tx = { episode: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) } };
  const prisma = {
    episode: { findMany: vi.fn().mockResolvedValue(episodes) },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const playback = { getMany: vi.fn() };
  const service = new EpisodesService(prisma as never, {} as never, playback as never);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.episode.findMany.mockResolvedValue(episodes);
    tx.episode.updateMany.mockResolvedValue({ count: 2 });
    playback.getMany.mockResolvedValue(new Map(episodes.map((episode) => [episode.id, { readiness: { playable: true, message: null } }])));
  });

  it('publica el lote completo en una sola transacción cuando todos están listos', async () => {
    await expect(service.publish({ ids: episodes.map((episode) => episode.id), published: true })).resolves.toEqual({ updated: 2, published: true });
    expect(tx.episode.updateMany).toHaveBeenCalledOnce();
  });

  it('rechaza todo el lote con detalle por episodio y no escribe parcialmente', async () => {
    playback.getMany.mockResolvedValueOnce(new Map([
      ['episode-1', { readiness: { playable: true, message: null } }],
      ['episode-2', { readiness: { playable: false, message: 'El manifiesto HLS no existe.' } }],
    ]));
    await expect(service.publish({ ids: episodes.map((episode) => episode.id), published: true })).rejects.toThrow('Episodio 1x02 (Continuación): El manifiesto HLS no existe.');
    await expect(service.publish({ ids: episodes.map((episode) => episode.id), published: true })).resolves.toEqual({ updated: 2, published: true });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe('EpisodesService admin detail', () => {
  const prisma = {
    episode: { findFirst: vi.fn() },
    videoProcessingJob: { findFirst: vi.fn() },
  };
  const storage = { publicUrl: vi.fn((path: string) => `/uploads/${path}`), exists: vi.fn().mockResolvedValue(true) };
  const playback = { getEpisode: vi.fn() };
  const service = new EpisodesService(prisma as never, storage as never, playback as never);

  beforeEach(() => {
    vi.clearAllMocks();
    playback.getEpisode.mockResolvedValue({ readiness: { playable: true }, publicationState: 'READY' });
  });

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
