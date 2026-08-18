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
    id: 'job-1', requestedById: 'admin-1', inputMediaFileId: 'media-1', outputMediaFileId: status === 'COMPLETED' ? 'output-1' : null,
    queueJobId: null, kind: 'HLS', status, progress: status === 'COMPLETED' ? 100 : 17, processingStage: status,
    sourceWidth: 1920, sourceHeight: 1080, durationSec: 120, sourceFormat: 'matroska',
    sourceVideoCodec: 'h264', sourceAudioCodecs: [], sourceMetadata: null, profiles: [720, 1080],
    generatedQualities: status === 'COMPLETED' ? [720, 1080] : [], audioTracks: [], subtitleTracks: [],
    masterPath: status === 'COMPLETED' ? 'hls/job-1/master.m3u8' : null,
    thumbnailPath: status === 'COMPLETED' ? 'images/job-1-thumbnail.jpg' : null,
    targetType: null, targetId: null, associatedAt: null, retainOriginal: true, cancelRequested: false,
    attempts: 1, errorMessage: null, startedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    inputMediaFile: { id: 'media-1', originalName: 'episodio.mkv', storageName: 'video.mkv', relativePath: 'videos/video.mkv', mimeType: 'video/x-matroska', extension: '.mkv', sizeBytes: BigInt(100), checksum: null, mediaType: 'VIDEO', status: 'PROCESSING', width: 1920, height: 1080, durationSec: 120, bitrate: null, videoCodec: 'h264', audioCodec: 'aac', probeMetadata: null, errorMessage: null, createdAt: new Date(), updatedAt: new Date() },
    outputMediaFile: status === 'COMPLETED' ? { id: 'output-1', relativePath: 'hls/job-1/master.m3u8', extension: '.m3u8', status: 'READY' } : null,
    ...overrides,
  };
}

describe('EpisodesService video linking', () => {
  const tx = {
    series: { findFirst: vi.fn() },
    season: { findFirst: vi.fn() },
    episode: { aggregate: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    videoProcessingJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    mediaFile: { findFirst: vi.fn() },
    subtitleTrack: { count: vi.fn(), create: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const storage = { publicUrl: vi.fn((path: string) => `/uploads/${path}`), exists: vi.fn().mockResolvedValue(true) };
  const playback = { evaluateSource: vi.fn(async (input: { mode: string; media: { extension: string; relativePath: string; inputJobs: Array<{ status: string; masterPath?: string | null; outputMediaFile?: unknown }> } }) => {
    if (input.mode === 'ORIGINAL') {
      if (input.media.extension.toLowerCase() !== '.mp4') return { playable: false, message: 'El archivo original no es compatible para publicacion directa.' };
      if (!await storage.exists(input.media.relativePath)) return { playable: false, message: 'El archivo original no existe en el almacenamiento.' };
      return { playable: true, message: null };
    }
    const ready = input.media.inputJobs.some((item) => item.status === 'COMPLETED' && (input.mode === 'HLS' ? Boolean(item.masterPath) : Boolean(item.outputMediaFile)));
    return { playable: ready, message: ready ? null : `El ${input.mode} sigue procesandose o no esta listo.` };
  }) };
  const service = new EpisodesService(prisma as never, storage as never, playback as never);

  beforeEach(() => {
    vi.clearAllMocks();
    storage.exists.mockResolvedValue(true);
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
    await service.create({ ...baseDto(), processingJobId: 'job-1', published: false }, 'admin-1');
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoUrl: null, published: false }) }));
    expect(tx.videoProcessingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetType: 'EPISODE', targetId: 'episode-1' }) }));
  });

  it('aplica inmediatamente HLS cuando el job ya esta completado', async () => {
    tx.videoProcessingJob.findUnique.mockResolvedValue(job(VideoProcessingStatus.COMPLETED));
    await service.create({ ...baseDto(), processingJobId: 'job-1' }, 'admin-1');
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ playbackMode: 'HLS', videoUrl: '/uploads/hls/job-1/master.m3u8', videoSource: 'HLS', videoType: 'HLS', published: true }) }));
    expect(tx.videoProcessingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ associatedAt: expect.any(Date) }) }));
  });

  it('permite crear un borrador sin video', async () => {
    await service.create({ ...baseDto(), published: false }, 'admin-1');
    expect(tx.videoProcessingJob.findUnique).not.toHaveBeenCalled();
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoUrl: null, published: false }) }));
  });

  it('vincula un MP4 original sin crear ni reservar un trabajo FFmpeg', async () => {
    tx.mediaFile.findFirst.mockResolvedValue({ id: 'media-original', originalName: 'episode.mp4', relativePath: 'videos/episode.mp4', extension: '.mp4', durationSec: 90, videoCodec: 'h264', audioCodec: 'aac', inputJobs: [] });
    await service.create({ ...baseDto(), mediaFileId: 'media-original' }, 'admin-1');
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mediaFileId: 'media-original', playbackMode: 'ORIGINAL', videoUrl: '/uploads/videos/episode.mp4', originalVideoUrl: '/uploads/videos/episode.mp4' }) }));
    expect(tx.videoProcessingJob.findUnique).not.toHaveBeenCalled();
    expect(tx.videoProcessingJob.updateMany).not.toHaveBeenCalled();
  });

  it('guarda un MKV original pero rechaza publicarlo directamente', async () => {
    tx.mediaFile.findFirst.mockResolvedValue({ id: 'media-mkv', originalName: 'episode.mkv', relativePath: 'videos/episode.mkv', extension: '.mkv', durationSec: 90, videoCodec: 'hevc', audioCodec: 'dts', inputJobs: [] });
    await expect(service.create({ ...baseDto(), mediaFileId: 'media-mkv', playbackMode: 'ORIGINAL' }, 'admin-1')).rejects.toThrow('no es compatible');
    expect(tx.videoProcessingJob.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza relacionar un original registrado que falta fisicamente', async () => {
    tx.mediaFile.findFirst.mockResolvedValue({ id: 'media-original', originalName: 'episode.mp4', relativePath: 'videos/missing.mp4', extension: '.mp4', durationSec: 90, videoCodec: 'h264', audioCodec: 'aac', inputJobs: [] });
    storage.exists.mockResolvedValueOnce(false);
    await expect(service.create({ ...baseDto(), mediaFileId: 'media-original' }, 'admin-1')).rejects.toThrow('no existe en el almacenamiento');
    expect(tx.episode.create).not.toHaveBeenCalled();
  });

  it('permite guardar REMUX en proceso como borrador pero no publicarlo', async () => {
    tx.videoProcessingJob.findUnique.mockResolvedValue(job(VideoProcessingStatus.PROCESSING, { kind: 'REMUX' }));
    await service.create({ ...baseDto(), processingJobId: 'job-1', playbackMode: 'REMUX', published: false }, 'admin-1');
    expect(tx.episode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ playbackMode: 'REMUX', videoUrl: null, published: false }) }));
    tx.videoProcessingJob.findUnique.mockResolvedValue(job(VideoProcessingStatus.PROCESSING, { kind: 'REMUX' }));
    await expect(service.create({ ...baseDto(), processingJobId: 'job-1', playbackMode: 'REMUX', published: true }, 'admin-1')).rejects.toThrow('sigue procesandose');
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
    await expect(service.create({ ...baseDto(), processingJobId: 'job-1', published: false }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('traduce la unicidad seasonId + number a un conflicto comprensible', async () => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }));
    await expect(service.create({ ...baseDto(), published: false }, 'admin-1')).rejects.toThrow('numero para la temporada');
  });
});
