import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminMediaService } from './admin-media.service';
import { AdminMediaQueryDto } from './admin-media.dto';

const completedJob = {
  id: 'job123', kind: 'HLS', status: 'COMPLETED', processingStage: 'COMPLETED', progress: 100, masterPath: 'hls/job123/master.m3u8', thumbnailPath: null,
  targetType: 'EPISODE', targetId: 'episode1', associatedAt: new Date(), retainOriginal: true, inputMediaFileId: 'input1', outputMediaFileId: 'output1',
  generatedQualities: [360, 720, 1080], sourceWidth: 1920, sourceHeight: 1080, createdAt: new Date('2026-08-08T00:00:00Z'), updatedAt: new Date('2026-08-08T01:00:00Z'),
  inputMediaFile: { id: 'input1', originalName: 'episode.mkv', relativePath: 'videos/input.mkv', sizeBytes: 1000n, status: 'READY', width: 1920, height: 1080 },
  outputMediaFile: { id: 'output1', relativePath: 'hls/job123/master.m3u8', sizeBytes: 2000n, status: 'READY' }, errorMessage: null,
};

function setup(job: unknown = completedJob) {
  const tx = {
    episode: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, movie: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    videoProcessingJob: { update: vi.fn().mockResolvedValue(job) }, mediaFile: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    videoProcessingJob: { findUnique: vi.fn().mockResolvedValue(job), update: vi.fn().mockResolvedValue(job) },
    mediaFile: { update: vi.fn().mockResolvedValue({}) }, episode: { count: vi.fn().mockResolvedValue(0), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn() }, movie: { count: vi.fn().mockResolvedValue(0), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (operation: ((client: typeof tx) => Promise<unknown>) | Array<Promise<unknown>>) => Array.isArray(operation) ? Promise.all(operation) : operation(tx)),
  };
  const storage = { exists: vi.fn().mockResolvedValue(true), publicUrl: vi.fn((key: string) => `/uploads/${key}`), deletePrefix: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) };
  const processing = { cancel: vi.fn(), retry: vi.fn(), associateAsAdmin: vi.fn() };
  const service = new AdminMediaService(prisma as never, storage as never, processing as never);
  return { service, prisma, storage, processing, tx };
}

describe('AdminMediaService destructive rules', () => {
  it('rejects publishing when the job is still processing', async () => {
    const { service } = setup({ ...completedJob, status: 'PROCESSING', masterPath: null, outputMediaFile: null });
    await expect(service.publish('job123', 'admin1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an HLS path that is not derived from the job id', async () => {
    const { service, storage } = setup({ ...completedJob, masterPath: 'hls/another/master.m3u8' });
    await expect(service.deleteHls('job123')).rejects.toBeInstanceOf(ConflictException);
    expect(storage.deletePrefix).not.toHaveBeenCalled();
  });

  it('deletes only an inactive HLS prefix and preserves the original', async () => {
    const { service, storage, tx } = setup();
    await expect(service.deleteHls('job123')).resolves.toEqual({ removed: true, releasedBytes: '2000', originalPreserved: true });
    expect(storage.deletePrefix).toHaveBeenCalledWith('hls/job123');
    expect(storage.delete).not.toHaveBeenCalled();
    expect(tx.episode.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ processedVideoUrl: null }) }));
  });

  it('blocks deleting HLS while it is the active episode source', async () => {
    const { service, prisma, storage } = setup();
    prisma.episode.count.mockResolvedValueOnce(1);
    await expect(service.deleteHls('job123')).rejects.toBeInstanceOf(ConflictException);
    expect(storage.deletePrefix).not.toHaveBeenCalled();
  });

  it('refuses to delete an original marked for retention', async () => {
    const { service, storage } = setup();
    await expect(service.deleteOriginal('job123')).rejects.toBeInstanceOf(ConflictException);
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

describe('AdminMediaService listing', () => {
  it('does not expose a completed REMUX as ready HLS', async () => {
    const remuxJob = {
      id: 'remux1', kind: 'REMUX', status: 'COMPLETED', progress: 100, masterPath: null, thumbnailPath: null, errorMessage: null,
      outputMediaFile: { relativePath: 'videos/remux-remux1.mp4', status: 'READY', extension: '.mp4', sizeBytes: 500n },
    };
    const media = {
      id: 'input1', originalName: 'episode.mkv', relativePath: 'videos/episode.mkv', extension: '.mkv', mimeType: 'video/x-matroska',
      sizeBytes: 1000n, status: 'READY', width: 1440, height: 1080, durationSec: 1496, videoCodec: 'h264', audioCodec: 'aac',
      fastStart: null, errorMessage: null, createdAt: new Date(), inputJobs: [remuxJob],
    };
    const prisma = { mediaFile: { findMany: vi.fn().mockResolvedValue([media]) } };
    const storage = { exists: vi.fn().mockResolvedValue(true), publicUrl: vi.fn((key: string) => `/uploads/${key}`) };
    const service = new AdminMediaService(prisma as never, storage as never, {} as never);
    const [result] = await service.listSelectable();
    expect(result.remuxStatus).toBe('READY');
    expect(result.remuxUrl).toMatch(/\.mp4$/);
    expect(result.status).toBe('ORIGINAL');
    expect(result.hlsUrl).toBeNull();
  });

  it('normalizes processing content, active uploads, and unassigned files', async () => {
    const movieJob = { ...completedJob, id: 'moviejob', targetType: 'MOVIE', targetId: 'movie1', inputMediaFileId: 'input2', outputMediaFileId: 'output2', masterPath: 'hls/moviejob/master.m3u8', inputMediaFile: { ...completedJob.inputMediaFile, id: 'input2', originalName: 'movie.mkv', relativePath: 'videos/movie.mkv' }, outputMediaFile: { ...completedJob.outputMediaFile, id: 'output2', relativePath: 'hls/moviejob/master.m3u8' } };
    const orphan = { id: 'orphan1', originalName: 'unassigned.mp4', sizeBytes: 500n, status: 'READY', width: 1280, height: 720, createdAt: new Date(), updatedAt: new Date(), errorMessage: null, mediaType: 'VIDEO', relativePath: 'videos/unassigned.mp4' };
    const staleJob = { ...completedJob, id: 'stalejob', targetId: 'missing-episode', masterPath: 'hls/stalejob/master.m3u8', inputMediaFileId: 'input3', outputMediaFileId: 'output3', inputMediaFile: { ...completedJob.inputMediaFile, id: 'input3' }, outputMediaFile: { ...completedJob.outputMediaFile, id: 'output3' } };
    const prisma = {
      videoProcessingJob: { findMany: vi.fn().mockResolvedValue([completedJob, movieJob, staleJob]) },
      resumableUpload: { findMany: vi.fn().mockResolvedValue([{ id: 'upload1', originalName: 'uploading.mp4', sizeBytes: 1000n, uploadedParts: [0], totalChunks: 2, status: 'UPLOADING', errorMessage: null, createdAt: new Date(), updatedAt: new Date() }]) },
      mediaFile: { findMany: vi.fn().mockResolvedValue([orphan]) },
      episode: { findMany: vi.fn().mockResolvedValue([{ id: 'episode1', title: 'Piloto', number: 1, published: false, series: { title: 'Demo' } }]) },
      movie: { findMany: vi.fn().mockResolvedValue([{ id: 'movie1', title: 'Pelicula demo', status: 'PUBLISHED' }]) },
    };
    const storage = { publicUrl: vi.fn((key: string) => `/uploads/${key}`), keyFromUrl: vi.fn((url: string) => url.replace('/uploads/', '')), exists: vi.fn().mockResolvedValue(true) };
    const service = new AdminMediaService(prisma as never, storage as never, {} as never);
    const result = await service.list(new AdminMediaQueryDto());
    expect(new Set(result.items.map((item) => item.contentType))).toEqual(new Set(['UPLOAD', 'UNASSIGNED', 'MOVIE', 'EPISODE']));
    expect(result.items.find((item) => item.contentType === 'UPLOAD')?.progress).toBe(50);
    expect(result.summary.published).toBe(1);
    expect(result.summary.unassigned).toBe(2);
    expect(result.items.find((item) => item.id === 'stalejob')?.actions.publish).toBe(false);
  });
});
