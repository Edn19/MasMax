import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType } from '@prisma/client';
import { spawn } from 'child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { basename, join, relative } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { absoluteSegmentPlaylist, masterPlaylist, selectVideoProfiles } from './video-processing.utils';

class ProcessingCancelledError extends Error {}

@Injectable()
export class VideoProcessingProcessor {
  private readonly logger = new Logger(VideoProcessingProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly storage: ObjectStorageService) {}

  async process(id: string) {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error('Identificador de procesamiento no valido');
    const current = await this.prisma.videoProcessingJob.findUnique({ where: { id }, include: { inputMediaFile: true } });
    if (!current || current.status !== 'QUEUED') return;
    const sourceWidth = current.inputMediaFile.width ?? 0;
    const sourceHeight = current.inputMediaFile.height ?? 0;
    const durationSec = current.inputMediaFile.durationSec ?? 0;
    if (!sourceWidth || !sourceHeight || !durationSec) throw new Error('El MP4 no tiene metadatos suficientes para procesarse');
    const profiles = selectVideoProfiles(sourceHeight, this.config.get<string>('HLS_PROFILES') ?? '360,480,720,1080');
    const workRoot = join(this.config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'), 'tmp', 'processing', id);
    const hlsRoot = join(workRoot, 'hls');
    const downloadedInput = join(workRoot, 'input.mp4');
    const localInput = this.storage.localPath(current.inputMediaFile.relativePath);
    const inputPath = localInput ?? downloadedInput;
    const uploadedKeys: string[] = [];
    await rm(workRoot, { recursive: true, force: true });
    await mkdir(hlsRoot, { recursive: true });
    if (!localInput) await this.storage.downloadToFile(current.inputMediaFile.relativePath, downloadedInput);
    await this.prisma.$transaction([
      this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'PROCESSING', progress: 1, sourceWidth, sourceHeight, durationSec, profiles, startedAt: new Date(), completedAt: null, errorMessage: null } }),
      this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.PROCESSING, errorMessage: null } }),
    ]);
    try {
      const segmentSeconds = this.segmentSeconds();
      for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
        await this.assertNotCancelled(id);
        const height = profiles[profileIndex];
        const profileDir = join(hlsRoot, String(height));
        await mkdir(profileDir, { recursive: true });
        await this.runFfmpeg(id, [
          '-hide_banner', '-y', '-i', inputPath,
          '-map', '0:v:0', '-map', '0:a:0?',
          '-vf', `scale=-2:${height}`,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
          '-force_key_frames', `expr:gte(t,n_forced*${segmentSeconds})`,
          '-hls_time', String(segmentSeconds), '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
          '-hls_segment_filename', join(profileDir, 'segment-%05d.ts'),
          '-progress', 'pipe:1', '-nostats', join(profileDir, 'index.m3u8'),
        ], durationSec, (profileProgress) => this.updateProgress(id, Math.min(90, Math.round((profileIndex + profileProgress / 100) / profiles.length * 90))));
        if (this.storage.driverName === 's3') {
          const playlistPath = join(profileDir, 'index.m3u8');
          const playlist = await readFile(playlistPath, 'utf8');
          await writeFile(playlistPath, absoluteSegmentPlaylist(playlist, `/api/storage/objects/hls/${id}/${height}`), 'utf8');
        }
      }
      await this.assertNotCancelled(id);
      const thumbnailPath = join(workRoot, 'thumbnail.jpg');
      await this.runFfmpeg(id, ['-hide_banner', '-y', '-ss', String(Math.min(10, Math.max(0, durationSec * 0.1))), '-i', inputPath, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '2', thumbnailPath]);
      const masterPath = join(hlsRoot, 'master.m3u8');
      const hlsApiBase = this.storage.driverName === 's3' ? `/api/storage/objects/hls/${id}` : '';
      await writeFile(masterPath, masterPlaylist(sourceWidth, sourceHeight, profiles, hlsApiBase), 'utf8');
      await this.updateProgress(id, 92);

      const files = await this.walk(hlsRoot);
      const totalSize = (await Promise.all(files.map((path) => stat(path)))).reduce((sum, value) => sum + value.size, 0);
      for (let index = 0; index < files.length; index += 1) {
        await this.assertNotCancelled(id);
        const suffix = relative(hlsRoot, files[index]).replace(/\\/g, '/');
        const key = `hls/${id}/${suffix}`;
        await this.storage.putFile(key, files[index], { contentType: this.contentType(suffix) });
        uploadedKeys.push(key);
        await this.updateProgress(id, 92 + Math.round((index + 1) / (files.length + 1) * 6));
      }
      const thumbnailKey = `images/${id}-thumbnail.jpg`;
      const thumbnailSize = (await stat(thumbnailPath)).size;
      await this.storage.putFile(thumbnailKey, thumbnailPath, { contentType: 'image/jpeg' });
      uploadedKeys.push(thumbnailKey);
      const masterKey = `hls/${id}/master.m3u8`;
      const output = await this.prisma.$transaction(async (tx) => {
        const outputMedia = await tx.mediaFile.create({ data: { originalName: `${current.inputMediaFile.originalName} (HLS)`, storageName: `${id}-master.m3u8`, relativePath: masterKey, mimeType: 'application/vnd.apple.mpegurl', extension: '.m3u8', sizeBytes: BigInt(totalSize), mediaType: MediaType.VIDEO, status: MediaStatus.READY, width: sourceWidth, height: sourceHeight, durationSec, videoCodec: 'h264', audioCodec: 'aac' } });
        await tx.mediaFile.create({ data: { originalName: `${current.inputMediaFile.originalName} (miniatura)`, storageName: `${id}-thumbnail.jpg`, relativePath: thumbnailKey, mimeType: 'image/jpeg', extension: '.jpg', sizeBytes: BigInt(thumbnailSize), mediaType: MediaType.IMAGE, status: MediaStatus.READY } });
        return tx.videoProcessingJob.update({ where: { id }, data: { outputMediaFileId: outputMedia.id, masterPath: masterKey, thumbnailPath: thumbnailKey, status: 'COMPLETED', progress: 100, completedAt: new Date(), cancelRequested: false } });
      });
      if (!output.retainOriginal) {
        try {
          await this.storage.delete(current.inputMediaFile.relativePath);
          await this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.DELETED, errorMessage: null } });
        } catch (error) {
          const message = `HLS listo; no se pudo eliminar el original: ${error instanceof Error ? error.message : 'error desconocido'}`.slice(0, 500);
          await this.prisma.videoProcessingJob.update({ where: { id }, data: { retainOriginal: true, errorMessage: message } });
          await this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.READY } });
        }
      } else await this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.READY } });
      this.logger.log(`Procesamiento ${id} completado con perfiles ${profiles.join(',')}`);
    } catch (error) {
      await Promise.all(uploadedKeys.map((key) => this.storage.delete(key).catch(() => undefined)));
      const cancelled = error instanceof ProcessingCancelledError;
      const message = (cancelled ? 'Procesamiento cancelado por el administrador' : error instanceof Error ? error.message : 'Error desconocido de FFmpeg').slice(0, 500);
      await this.prisma.$transaction([
        this.prisma.videoProcessingJob.update({ where: { id }, data: { status: cancelled ? 'CANCELLED' : 'FAILED', errorMessage: message, completedAt: new Date(), cancelRequested: cancelled } }),
        this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: cancelled ? MediaStatus.READY : MediaStatus.FAILED, errorMessage: cancelled ? null : message } }),
      ]).catch(() => undefined);
      throw error;
    } finally { await rm(workRoot, { recursive: true, force: true }).catch(() => undefined); }
  }

  private runFfmpeg(id: string, args: string[], durationSec?: number, onProgress?: (progress: number) => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args, { windowsHide: true, shell: false });
      let stderr = '';
      let progressBuffer = '';
      let lastProgressUpdate = 0;
      const cancellationPoll = setInterval(() => void this.isCancelled(id).then((cancelled) => { if (cancelled) child.kill('SIGTERM'); }).catch(() => undefined), 1000);
      child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-12_000); });
      child.stdout.on('data', (chunk: Buffer) => {
        progressBuffer += chunk.toString();
        const lines = progressBuffer.split(/\r?\n/); progressBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const match = /^out_time_(?:ms|us)=(\d+)$/.exec(line);
          if (!match || !durationSec || !onProgress || Date.now() - lastProgressUpdate < 1000) continue;
          lastProgressUpdate = Date.now();
          void onProgress(Math.min(100, Number(match[1]) / 1_000_000 / durationSec * 100)).catch(() => undefined);
        }
      });
      child.once('error', () => { clearInterval(cancellationPoll); reject(new Error('FFmpeg no esta disponible en el worker')); });
      child.once('exit', (code, signal) => {
        clearInterval(cancellationPoll);
        void this.isCancelled(id).then((cancelled) => {
          if (cancelled || signal === 'SIGTERM') reject(new ProcessingCancelledError());
          else if (code === 0) resolve();
          else reject(new Error(`FFmpeg termino con codigo ${code}: ${stderr.slice(-1000)}`));
        }).catch(reject);
      });
    });
  }

  private async updateProgress(id: string, progress: number) { await this.prisma.videoProcessingJob.updateMany({ where: { id, status: 'PROCESSING' }, data: { progress: Math.max(1, Math.min(99, progress)) } }); }
  private async isCancelled(id: string) { return Boolean((await this.prisma.videoProcessingJob.findUnique({ where: { id }, select: { cancelRequested: true } }))?.cancelRequested); }
  private async assertNotCancelled(id: string) { if (await this.isCancelled(id)) throw new ProcessingCancelledError(); }
  private segmentSeconds() { const value = Number(this.config.get<string>('HLS_SEGMENT_SECONDS') ?? 6); return Number.isInteger(value) && value >= 2 && value <= 15 ? value : 6; }
  private contentType(path: string) { return path.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : path.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream'; }
  private async walk(root: string): Promise<string[]> { const entries = await readdir(root, { withFileTypes: true }); const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? this.walk(join(root, entry.name)) : Promise.resolve([join(root, entry.name)]))); return nested.flat().sort(); }
}
