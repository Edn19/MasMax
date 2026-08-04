import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { open, rm } from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { assertContainerSignature, probeMedia, validateUploadIdentity } from '../video-processing/media-probe';

@Injectable()
export class MediaValidationService {
  private readonly logger = new Logger(MediaValidationService.name);
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService, private readonly config: ConfigService) {}

  async validateVideo(file: Express.Multer.File) {
    try {
      if (!file.size) throw new BadRequestException('El archivo de video esta vacio');
      const identity = validateUploadIdentity(file.originalname, file.mimetype);
      await assertContainerSignature(file.path, identity.extension);
      const probe = await probeMedia(file.path, identity.extension);
      const maxHeight = Number(this.config.get<string>('VIDEO_MAX_SOURCE_HEIGHT') ?? 1080);
      if (probe.height > maxHeight) throw new BadRequestException(`La resolucion maxima permitida es ${maxHeight}p`);
      const storageName = file.filename.replace(/\.upload$/, identity.extension);
      const relativePath = `videos/${storageName}`;
      const checksum = await this.checksum(file.path);
      const mimeType = identity.extension === '.mkv' ? 'video/x-matroska' : 'video/mp4';
      await this.storage.putFile(relativePath, file.path, { contentType: mimeType });
      try {
        const probeMetadata = JSON.parse(JSON.stringify(probe)) as Prisma.InputJsonValue;
        const media = await this.prisma.mediaFile.create({ data: { originalName: file.originalname, storageName, relativePath, mimeType, extension: identity.extension, sizeBytes: BigInt(file.size), checksum, mediaType: MediaType.VIDEO, status: MediaStatus.READY, width: probe.width, height: probe.height, durationSec: probe.durationSec, bitrate: probe.bitrate, videoCodec: probe.videoCodec, audioCodec: probe.audioTracks[0]?.codec, probeMetadata } });
        return { url: this.storage.publicUrl(relativePath), filename: storageName, originalName: file.originalname, size: file.size, mimeType, mediaId: media.id, metadata: probe };
      } catch (error) { await this.storage.delete(relativePath).catch(() => undefined); throw error; }
    } catch (error) {
      await rm(file.path, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async validateImage(file: Express.Multer.File) {
    try {
      const kind = await this.imageKind(file.path);
      if (!kind) throw new BadRequestException('La firma del archivo no corresponde a una imagen permitida');
      const storageName = `${file.filename.replace(/\.upload$/, '')}${kind.extension}`;
      const relativePath = `images/${storageName}`;
      const checksum = await this.checksum(file.path);
      await this.storage.putFile(relativePath, file.path, { contentType: kind.mimeType });
      try {
        const media = await this.prisma.mediaFile.create({ data: { originalName: file.originalname, storageName, relativePath, mimeType: kind.mimeType, extension: kind.extension, sizeBytes: BigInt(file.size), checksum, mediaType: MediaType.IMAGE, status: MediaStatus.READY } });
        return { url: this.storage.publicUrl(relativePath), filename: storageName, size: file.size, mimeType: kind.mimeType, mediaId: media.id };
      } catch (error) { await this.storage.delete(relativePath).catch(() => undefined); throw error; }
    } catch (error) { await rm(file.path, { force: true }).catch(() => undefined); throw error; }
  }

  private async imageKind(path: string) { const handle = await open(path, 'r'); try { const buffer = Buffer.alloc(16); await handle.read(buffer, 0, 16, 0); if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: '.jpg', mimeType: 'image/jpeg' }; if (buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return { extension: '.png', mimeType: 'image/png' }; if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return { extension: '.webp', mimeType: 'image/webp' }; return null; } finally { await handle.close(); } }
  private checksum(path: string) { return new Promise<string>((resolve, reject) => { const hash = createHash('sha256'); createReadStream(path).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))); }); }
}
