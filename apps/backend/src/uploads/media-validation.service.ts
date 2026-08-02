import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType } from '@prisma/client';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, open, rename, rm } from 'fs/promises';
import { spawn } from 'child_process';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

type ProbeResult = { format?: { duration?: string; bit_rate?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }> };

@Injectable()
export class MediaValidationService {
  private readonly logger = new Logger(MediaValidationService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async validateVideo(file: Express.Multer.File) {
    try {
      await this.assertMp4Signature(file.path);
      const probe = await this.ffprobe(file.path);
      const video = probe.streams?.find((stream) => stream.codec_type === 'video');
      if (!video) throw new BadRequestException('El archivo no contiene una pista de video valida');
      if ((video.height ?? 0) > 1080) throw new BadRequestException('La resolucion maxima permitida es 1080p');
      const storageName = file.filename.replace(/\.upload$/, '.mp4');
      const destination = join(this.root(), 'videos', storageName);
      await mkdir(join(this.root(), 'videos'), { recursive: true });
      await rename(file.path, destination);
      const media = await this.prisma.mediaFile.create({ data: { originalName: file.originalname, storageName, relativePath: `videos/${storageName}`, mimeType: 'video/mp4', extension: '.mp4', sizeBytes: BigInt(file.size), checksum: await this.checksum(destination), mediaType: MediaType.VIDEO, status: MediaStatus.READY, width: video.width, height: video.height, durationSec: Number(probe.format?.duration ?? 0), bitrate: Number(probe.format?.bit_rate ?? 0) || null, videoCodec: video.codec_name, audioCodec: probe.streams?.find((stream) => stream.codec_type === 'audio')?.codec_name } });
      return { url: `/uploads/videos/${storageName}`, filename: storageName, originalName: file.originalname, size: file.size, mimeType: 'video/mp4', mediaId: media.id, metadata: { width: media.width, height: media.height, durationSec: media.durationSec, videoCodec: media.videoCodec } };
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
      const destination = join(this.root(), 'images', storageName);
      await mkdir(join(this.root(), 'images'), { recursive: true });
      await rename(file.path, destination);
      const media = await this.prisma.mediaFile.create({ data: { originalName: file.originalname, storageName, relativePath: `images/${storageName}`, mimeType: kind.mimeType, extension: kind.extension, sizeBytes: BigInt(file.size), checksum: await this.checksum(destination), mediaType: MediaType.IMAGE, status: MediaStatus.READY } });
      return { url: `/uploads/images/${storageName}`, filename: storageName, size: file.size, mimeType: kind.mimeType, mediaId: media.id };
    } catch (error) { await rm(file.path, { force: true }).catch(() => undefined); throw error; }
  }

  private root() { return this.config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'); }
  private async assertMp4Signature(path: string) { const handle = await open(path, 'r'); try { const buffer = Buffer.alloc(12); await handle.read(buffer, 0, 12, 0); if (buffer.subarray(4, 8).toString('ascii') !== 'ftyp') throw new BadRequestException('El archivo tiene extension MP4 pero su contenido no es un MP4 valido'); } finally { await handle.close(); } }
  private async imageKind(path: string) { const handle = await open(path, 'r'); try { const buffer = Buffer.alloc(16); await handle.read(buffer, 0, 16, 0); if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: '.jpg', mimeType: 'image/jpeg' }; if (buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return { extension: '.png', mimeType: 'image/png' }; if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return { extension: '.webp', mimeType: 'image/webp' }; return null; } finally { await handle.close(); } }
  private checksum(path: string) { return new Promise<string>((resolve, reject) => { const hash = createHash('sha256'); createReadStream(path).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))); }); }
  private ffprobe(path: string) { return new Promise<ProbeResult>((resolve, reject) => { const child = spawn('ffprobe', ['-v','error','-print_format','json','-show_format','-show_streams',path], { windowsHide: true }); let stdout = ''; let stderr = ''; child.stdout.on('data', (data: Buffer) => stdout += data.toString()); child.stderr.on('data', (data: Buffer) => stderr += data.toString()); child.once('error', () => reject(new BadRequestException('FFprobe no esta disponible para validar el video'))); child.once('exit', (code) => { if (code !== 0) reject(new BadRequestException(`El video esta danado o no es compatible: ${stderr.slice(0,200)}`)); else { try { resolve(JSON.parse(stdout) as ProbeResult); } catch { reject(new BadRequestException('FFprobe devolvio metadatos invalidos')); } } }); }); }
}
