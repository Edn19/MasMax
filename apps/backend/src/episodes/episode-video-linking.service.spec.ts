import { ConflictException } from '@nestjs/common';
import { Prisma, VideoProcessingStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateEpisodeDto } from './dto';
import { EpisodesService } from './episodes.service';

const baseDto = (): CreateEpisodeDto => ({
  seriesId: 'series-1',
  seasonId: 'season-1',
  episodeNumber: 1,
  title: 'Episodio piloto',
  published: true,
});

function job(status: VideoProcessingStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1', requestedById: 'admin-1', inputMediaFileId: 'media-1', outputMediaFileId: null,
    queueJobId: null, status, progress: status === 'COMPLETED' ? 100 : 17, processingStage: status,
    sourceWidth: 1920, sourceHeight: 1080, durationSec: 120, sourceFormat: 'matroska',
    sourceVideoCodec: 'h264', sourceAudioCodecs: [], sourceMetadata: null, profiles: [720, 1080],
    generatedQualities: status === 'COMPLETED' ? [720, 1080] : [], audioTracks: [], subtitleTracks: [],
    masterPath: status === 'COMPLETED' ? 'hls/job-1/master.m3u8' : null,
    thumbnailPath: status === 'COMPLETED' ? 'images/job-1-thumbnail.jpg' : null,
    targetType: null, targetId: null, associatedAt: null, retainOriginal: true, cancelRequested: false,
    attempts: 1, errorMessage: null, startedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    inputMediaFile: { id: 'media-1', originalName: 'episodio.mkv', storageName: 'video.mkv', relativePath: 'videos/video.mkv', mimeType: 'video/x-matroska', extension: '.mkv', sizeBytes: BigInt(100), checksum: null, mediaType: 'VIDEO', status: 'PROCESSING', width: 1920, height: 1080, durationSec: 120, bitrate: null, videoCodec: 'h264', audioCodec: 'aac', probeMetadata: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() },
    ...overrides,
  };
}

describe('EpisodesService video linking', () => {
  const tx = {
    series: { findFirst: vi.fn() },
    season: { findFirst: vi.fn() },
    episode: { aggregate: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    videoProcessingJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    subtitleTrack: { count: vi.fn(), create: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const storage = { publicUrl: vi.fn((path: string) => `/uploads/${path}`) };
  const service = new EpisodesService(prisma as never, storage as never);

  beforeEach(() => {
    vi.clearAllMocks();
    tx.series.findFirst.mockResolvedValue({ id: 'series-1' });
    tx.season.findFirst.mockResolvedValue({ id: 'season-1' });
    tx.episode.findFirst.mockResolvedValue(null);
    tx.episode.aggregate.mockResolvedValue({ _min: { number: 1 }, _max: { position: 0 } });
    tx.episode.create.mockResolvedValue({ id: 'episode-1' });
    tx.episode.findUniqueOrThrow.mockResolvedValue({ id: 'episode-1', published: false });
    tx.videoProcessingJob.updateMany.mockResolvedValue({ count: 1 });
    tx.subtitleTrack.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it.each([VideoProcessingStatus.QUEUED, VideoProcessingStatus.PROCESSING])('crea un borrador y relaciona un job %s', async (status) => {
    tx.videoProcessingJob.findUnique.mockResolvedValue(job(status));
    await service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1');
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoUrl: null, published: false }) }));
    expect(tx.videoProcessingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetType: 'EPISODE', targetId: 'episode-1' }) }));
  });

  it('aplica inmediatamente HLS cuando el job ya esta completado', async () => {
    tx.videoProcessingJob.findUnique.mockResolvedValue(job(VideoProcessingStatus.COMPLETED));
    await service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1');
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoUrl: '/uploads/hls/job-1/master.m3u8', videoSource: 'HLS', videoType: 'HLS', published: true }) }));
    expect(tx.videoProcessingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ associatedAt: expect.any(Date) }) }));
  });

  it('permite crear un borrador sin video', async () => {
    await service.create({ ...baseDto(), published: false }, 'admin-1');
    expect(tx.videoProcessingJob.findUnique).not.toHaveBeenCalled();
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoUrl: null, published: false }) }));
  });

  it('rechaza un job inexistente, ajeno, fallido, cancelado o ya asignado', async () => {
    tx.videoProcessingJob.findUnique.mockResolvedValueOnce(null);
    await expect(service.create({ ...baseDto(), processingJobId: 'missing' }, 'admin-1')).rejects.toThrow('no existe');
    tx.videoProcessingJob.findUnique.mockResolvedValueOnce(job(VideoProcessingStatus.PROCESSING, { requestedById: 'admin-2' }));
    await expect(service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1')).rejects.toThrow('otro usuario');
    tx.videoProcessingJob.findUnique.mockResolvedValueOnce(job(VideoProcessingStatus.FAILED));
    await expect(service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1')).rejects.toThrow('fallo');
    tx.videoProcessingJob.findUnique.mockResolvedValueOnce(job(VideoProcessingStatus.CANCELLED));
    await expect(service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1')).rejects.toThrow('cancelado');
    tx.videoProcessingJob.findUnique.mockResolvedValueOnce(job(VideoProcessingStatus.PROCESSING, { targetType: 'EPISODE', targetId: 'episode-2' }));
    await expect(service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1')).rejects.toThrow('otro episodio');
  });

  it('revierte la operacion logica si el job se reserva concurrentemente', async () => {
    tx.videoProcessingJob.findUnique.mockResolvedValue(job(VideoProcessingStatus.PROCESSING));
    tx.videoProcessingJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('traduce la unicidad seasonId + number a un conflicto comprensible', async () => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }));
    await expect(service.create({ ...baseDto(), published: false }, 'admin-1')).rejects.toThrow('numero para la temporada');
  });
});
