import { ConfigService } from '@nestjs/config';
import { ResumableUpload } from '@prisma/client';
import { createReadStream } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { VideoProcessingService } from '../video-processing/video-processing.service';
import { MediaValidationService } from './media-validation.service';
import { ResumableUploadService } from './resumable-upload.service';

const sha256A = '559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd';

describe('ResumableUploadService', () => {
  let root: string;
  let current: ResumableUpload;
  let service: ResumableUploadService;
  const findFirst = vi.fn(async () => current as ResumableUpload | null);
  const update = vi.fn(async ({ data }: { data: Partial<ResumableUpload> }) => ({ ...current, ...data }));

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'masmax-resumable-'));
    current = {
      id: 'upload1', userId: 'admin1', originalName: 'sample.mp4', mimeType: 'video/mp4',
      sizeBytes: 1n, lastModified: 1234n, chunkSize: 1, totalChunks: 1, uploadedParts: [],
      checksum: null, status: 'UPLOADING', result: null, errorMessage: null,
      expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(), updatedAt: new Date(),
    };
    update.mockClear();
    findFirst.mockClear();
    const prisma = { resumableUpload: { findFirst, findMany: vi.fn(async () => []), update, create: vi.fn() } } as unknown as PrismaService;
    service = new ResumableUploadService(
      prisma,
      new ConfigService({ UPLOAD_DIR: root }),
      {} as MediaValidationService,
      {} as VideoProcessingService,
    );
  });

  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  function multerFile(path: string, size: number): Express.Multer.File {
    return { fieldname: 'file', originalname: 'part.chunk', encoding: '7bit', mimetype: 'application/octet-stream', size, destination: root, filename: 'incoming', path, buffer: Buffer.alloc(0), stream: createReadStream(path) };
  }

  it('rejects a complete file above the configured total limit before creating a session', async () => {
    await expect(service.initiate('admin1', { originalName: 'large.mp4', mimeType: 'video/mp4', size: 2048 * 1024 * 1024 + 1, lastModified: 1 })).rejects.toThrow('limite permitido de 2048 MB');
  });

  it('rejects out-of-range, expired and cancelled part writes', async () => {
    let incoming = join(root, 'out-of-range.chunk');
    await writeFile(incoming, 'A');
    await expect(service.uploadPart('admin1', current.id, multerFile(incoming, 1), { index: 1, checksum: sha256A })).rejects.toThrow('fuera de rango');

    current = { ...current, expiresAt: new Date(Date.now() - 1000) };
    incoming = join(root, 'expired.chunk'); await writeFile(incoming, 'A');
    await expect(service.uploadPart('admin1', current.id, multerFile(incoming, 1), { index: 0, checksum: sha256A })).rejects.toThrow('expirado');

    current = { ...current, status: 'CANCELLED', expiresAt: new Date(Date.now() + 60_000) };
    incoming = join(root, 'cancelled.chunk'); await writeFile(incoming, 'A');
    await expect(service.uploadPart('admin1', current.id, multerFile(incoming, 1), { index: 0, checksum: sha256A })).rejects.toThrow('CANCELLED');
  });

  it('rejects a wrong part size and a session not owned by the user', async () => {
    let incoming = join(root, 'wrong-size.chunk'); await writeFile(incoming, 'AA');
    await expect(service.uploadPart('admin1', current.id, multerFile(incoming, 2), { index: 0, checksum: sha256A })).rejects.toThrow('exactamente 1 bytes');
    findFirst.mockResolvedValueOnce(null);
    await expect(service.status('other-admin', current.id)).rejects.toThrow('no encontrada');
  });

  it('allows cancellation while an upload is assembling', async () => {
    current = { ...current, status: 'ASSEMBLING' };
    await expect(service.cancel('admin1', current.id)).resolves.toEqual({ cancelled: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }));
  });

  it('accepts an identical duplicate idempotently and rejects a different one', async () => {
    const sessionDir = join(root, 'tmp', 'resumable', current.id);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, '0.part'), 'A');
    current = { ...current, uploadedParts: [0] };

    let incoming = join(root, 'same.chunk'); await writeFile(incoming, 'A');
    const result = await service.uploadPart('admin1', current.id, multerFile(incoming, 1), { index: 0, checksum: sha256A, attempt: 2 });
    expect(result.uploadedParts).toEqual([0]);
    expect(update).not.toHaveBeenCalled();

    incoming = join(root, 'different.chunk'); await writeFile(incoming, 'B');
    const sha256B = 'df7e70e5021544f4834bbee64a9e3789febc4be81470df629cad6ddb03320a5c';
    await expect(service.uploadPart('admin1', current.id, multerFile(incoming, 1), { index: 0, checksum: sha256B })).rejects.toThrow('ya existe');
  });
});
