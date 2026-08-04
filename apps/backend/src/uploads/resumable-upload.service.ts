import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResumableUpload, ResumableUploadStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rename, rm, stat } from 'fs/promises';
import { basename, join } from 'path';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { MediaValidationService } from './media-validation.service';
import { CompleteResumableUploadDto, InitiateResumableUploadDto, UploadPartDto } from './resumable-upload.dto';
import { expectedPartSize, mergeUploadedPart, totalPartsFor } from './resumable-upload.utils';
import { VideoProcessingService } from '../video-processing/video-processing.service';
import { validateUploadIdentity } from '../video-processing/media-probe';
import { uploadsConfig } from './uploads.config';

const activeStatuses: ResumableUploadStatus[] = ['INITIATED', 'UPLOADING', 'ASSEMBLING'];

@Injectable()
export class ResumableUploadService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResumableUploadService.name);
  private readonly cancelledUploads = new Set<string>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly validation: MediaValidationService, private readonly processing: VideoProcessingService) {}
  async onModuleInit() {
    await this.cleanupExpired().catch(() => undefined);
    this.cleanupTimer = setInterval(() => void this.cleanupExpired().catch(() => undefined), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  async initiate(userId: string, dto: InitiateResumableUploadDto) {
    await this.cleanupExpired();
    if (/[\\/]/.test(dto.originalName)) throw new BadRequestException('El nombre del archivo no puede contener rutas');
    const originalName = basename(dto.originalName.trim());
    if (originalName !== dto.originalName.trim()) throw new BadRequestException('El nombre del archivo no es valido');
    validateUploadIdentity(originalName, dto.mimeType);
    const maxBytes = uploadsConfig.maxVideoUploadBytes;
    if (dto.size > maxBytes) throw new BadRequestException(`El archivo supera el limite permitido de ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
    const chunkSize = uploadsConfig.resumableChunkSizeBytes;
    const upload = await this.prisma.resumableUpload.create({ data: { userId, originalName, mimeType: dto.mimeType || (originalName.toLowerCase().endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4'), sizeBytes: BigInt(dto.size), lastModified: dto.lastModified === undefined ? null : BigInt(dto.lastModified), chunkSize, totalChunks: totalPartsFor(dto.size, chunkSize), checksum: dto.checksum?.toLowerCase(), expiresAt: this.expiration() } });
    await mkdir(this.sessionDir(upload.id), { recursive: true });
    return this.present(upload);
  }

  async list(userId: string) { await this.cleanupExpired(); const uploads = await this.prisma.resumableUpload.findMany({ where: { userId, status: { in: activeStatuses } }, orderBy: { updatedAt: 'desc' } }); return uploads.map((upload) => this.present(upload)); }
  async status(userId: string, id: string) { return this.present(await this.owned(userId, id)); }

  async uploadPart(userId: string, id: string, file: Express.Multer.File, dto: UploadPartDto) {
    const startedAt = Date.now();
    let expectedSize: number | undefined;
    try {
      const upload = await this.owned(userId, id);
      this.assertWritable(upload);
      if (dto.index >= upload.totalChunks) throw new BadRequestException('El indice de la parte esta fuera de rango');
      expectedSize = expectedPartSize(Number(upload.sizeBytes), upload.chunkSize, upload.totalChunks, dto.index);
      if (file.size !== expectedSize) throw new BadRequestException(`La parte debe tener exactamente ${expectedSize} bytes`);
      const checksum = await this.checksum(file.path);
      if (checksum !== dto.checksum.toLowerCase()) throw new BadRequestException('El checksum de la parte no coincide');
      await mkdir(this.sessionDir(id), { recursive: true });
      const destination = this.partPath(id, dto.index);
      if (upload.uploadedParts.includes(dto.index)) {
        const existing = await stat(destination).catch(() => null);
        const existingChecksum = existing?.size === expectedSize ? await this.checksum(destination) : null;
        await rm(file.path, { force: true });
        if (existingChecksum === checksum) {
          this.logPart('idempotent', id, userId, dto, expectedSize, file.size, upload.totalChunks, startedAt);
          return this.present(upload);
        }
        throw new ConflictException('La parte ya existe pero su tamano o checksum no coincide');
      }
      await rm(destination, { force: true });
      await rename(file.path, destination);
      const uploadedParts = mergeUploadedPart(upload.uploadedParts, dto.index);
      const updated = await this.prisma.resumableUpload.update({ where: { id }, data: { uploadedParts, status: 'UPLOADING', expiresAt: this.expiration(), errorMessage: null } });
      this.logPart('stored', id, userId, dto, expectedSize, file.size, upload.totalChunks, startedAt);
      return this.present(updated);
    } catch (error) {
      await rm(file.path, { force: true }).catch(() => undefined);
      this.logger.warn(JSON.stringify({ event: 'resumable_part_failed', uploadId: id, userId, partIndex: dto.index, expectedSize, receivedSize: file.size, attempt: dto.attempt ?? 1, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'Error desconocido' }));
      throw error;
    }
  }

  async complete(userId: string, id: string, dto: CompleteResumableUploadDto) {
    const upload = await this.owned(userId, id);
    this.assertWritable(upload);
    if (upload.uploadedParts.length !== upload.totalChunks || upload.uploadedParts.some((part, index) => part !== index)) throw new ConflictException('Todavia faltan partes por subir');
    const claimed = await this.prisma.resumableUpload.updateMany({ where: { id, status: { in: ['INITIATED', 'UPLOADING'] } }, data: { status: 'ASSEMBLING', errorMessage: null } });
    if (!claimed.count) throw new ConflictException('La carga ya se esta ensamblando');
    const assembledPath = this.assembledPath(id);
    try {
      await rm(assembledPath, { force: true });
      for (let index = 0; index < upload.totalChunks; index += 1) {
        if (this.cancelledUploads.has(id)) throw new ConflictException('La carga fue cancelada durante el ensamblado');
        await pipeline(createReadStream(this.partPath(id, index)), createWriteStream(assembledPath, { flags: 'a' }));
      }
      const assembledStat = await stat(assembledPath);
      if (assembledStat.size !== Number(upload.sizeBytes)) throw new BadRequestException('El tamano ensamblado no coincide con la carga iniciada');
      const checksum = await this.checksum(assembledPath);
      const expectedChecksum = dto.checksum?.toLowerCase() ?? upload.checksum;
      if (expectedChecksum && checksum !== expectedChecksum) throw new BadRequestException('El checksum final del archivo no coincide');
      if (this.cancelledUploads.has(id)) throw new ConflictException('La carga fue cancelada durante el ensamblado');
      const file = { fieldname: 'file', originalname: upload.originalName, encoding: '7bit', mimetype: upload.mimeType, size: assembledStat.size, destination: this.tempRoot(), filename: `${id}.upload`, path: assembledPath, buffer: Buffer.alloc(0), stream: createReadStream(assembledPath) } as Express.Multer.File;
      const result = await this.validation.validateVideo(file);
      const response = { ...result, processingJob: await this.processing.enqueue(userId, result.mediaId) };
      await this.prisma.resumableUpload.update({ where: { id }, data: { status: 'COMPLETED', result: response, checksum, expiresAt: new Date() } });
      await rm(this.sessionDir(id), { recursive: true, force: true });
      return response;
    } catch (error) {
      await rm(assembledPath, { force: true }).catch(() => undefined);
      const cancelled = this.cancelledUploads.delete(id);
      if (!cancelled) await this.prisma.resumableUpload.update({ where: { id }, data: { status: 'UPLOADING', expiresAt: this.expiration(), errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Error al completar la carga' } }).catch(() => undefined);
      throw error;
    }
  }

  async cancel(userId: string, id: string) {
    const upload = await this.owned(userId, id);
    if (upload.status === 'COMPLETED') throw new ConflictException('Una carga completada no se puede cancelar');
    if (upload.status === 'ASSEMBLING') this.cancelledUploads.add(id);
    await Promise.all([rm(this.sessionDir(id), { recursive: true, force: true }), rm(this.assembledPath(id), { force: true })]);
    await this.prisma.resumableUpload.update({ where: { id }, data: { status: 'CANCELLED', expiresAt: new Date() } });
    return { cancelled: true };
  }

  async cleanupExpired() {
    const expired = await this.prisma.resumableUpload.findMany({ where: { expiresAt: { lt: new Date() }, status: { in: activeStatuses } }, select: { id: true } });
    for (const upload of expired) {
      await Promise.all([rm(this.sessionDir(upload.id), { recursive: true, force: true }), rm(this.assembledPath(upload.id), { force: true })]);
      await this.prisma.resumableUpload.update({ where: { id: upload.id }, data: { status: 'EXPIRED' } });
    }
    return { removed: expired.length };
  }

  private async owned(userId: string, id: string) { const upload = await this.prisma.resumableUpload.findFirst({ where: { id, userId } }); if (!upload) throw new NotFoundException('Carga reanudable no encontrada'); return upload; }
  private assertWritable(upload: ResumableUpload) { if (!['INITIATED', 'UPLOADING'].includes(upload.status)) throw new ConflictException(`La carga esta en estado ${upload.status}`); if (upload.expiresAt < new Date()) throw new ConflictException('La carga ha expirado'); }
  private expiration() { return new Date(Date.now() + uploadsConfig.uploadExpirationHours * 3_600_000); }
  private tempRoot() { return join(this.config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'), 'tmp', 'resumable'); }
  private sessionDir(id: string) { if (!/^[a-z0-9]+$/i.test(id)) throw new BadRequestException('Identificador de carga no valido'); return join(this.tempRoot(), id); }
  private partPath(id: string, index: number) { return join(this.sessionDir(id), `${index}.part`); }
  private assembledPath(id: string) { return join(this.tempRoot(), `${id}.assembled.upload`); }
  private checksum(path: string) { return new Promise<string>((resolve, reject) => { const hash = createHash('sha256'); createReadStream(path).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))); }); }
  private logPart(event: 'stored' | 'idempotent', uploadId: string, userId: string, dto: UploadPartDto, expectedSize: number, receivedSize: number, totalChunks: number, startedAt: number) { this.logger.log(JSON.stringify({ event: `resumable_part_${event}`, uploadId, userId, partIndex: dto.index, expectedSize, receivedSize, totalChunks, attempt: dto.attempt ?? 1, durationMs: Date.now() - startedAt })); }
  private present(upload: ResumableUpload) { const uploadedBytes = upload.uploadedParts.reduce((sum, index) => sum + expectedPartSize(Number(upload.sizeBytes), upload.chunkSize, upload.totalChunks, index), 0); return { id: upload.id, originalName: upload.originalName, mimeType: upload.mimeType, size: Number(upload.sizeBytes), lastModified: upload.lastModified === null ? null : Number(upload.lastModified), chunkSize: upload.chunkSize, totalChunks: upload.totalChunks, uploadedParts: upload.uploadedParts, uploadedBytes, maxRetryAttempts: uploadsConfig.maxRetryAttempts, status: upload.status, expiresAt: upload.expiresAt.toISOString(), errorMessage: upload.errorMessage, result: upload.result }; }
}
