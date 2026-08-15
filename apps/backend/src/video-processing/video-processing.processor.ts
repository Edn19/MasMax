import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType, Prisma, VideoProcessingTargetType } from '@prisma/client';
import { spawn } from 'child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, relative } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { absoluteSegmentPlaylist, masterPlaylist, selectVideoProfiles } from './video-processing.utils';
import { canCopyPrimaryAudio, canCopyVideo, MediaProbeMetadata, probeMedia, SubtitleTrackMetadata } from './media-probe';

class ProcessingCancelledError extends Error {}
type ExtractedSubtitle = { url: string; key: string; language: string; label: string; originalName: string; size: number };

@Injectable()
export class VideoProcessingProcessor {
  private readonly logger = new Logger(VideoProcessingProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly storage: ObjectStorageService) {}

  async process(id: string) {
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error('Identificador de procesamiento no valido');
    const current = await this.prisma.videoProcessingJob.findUnique({ where: { id }, include: { inputMediaFile: true } });
    if (!current || current.status !== 'QUEUED') return;
    const workRoot = join(this.config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'), 'tmp', 'processing', id);
    const hlsRoot = join(workRoot, 'hls');
    const downloadedInput = join(workRoot, `input${current.inputMediaFile.extension}`);
    const localInput = this.storage.localPath(current.inputMediaFile.relativePath);
    const inputPath = localInput ?? downloadedInput;
    const uploadedKeys: string[] = [];
    try {
      await rm(workRoot, { recursive: true, force: true });
      await mkdir(hlsRoot, { recursive: true });
      if (!localInput) await this.storage.downloadToFile(current.inputMediaFile.relativePath, downloadedInput);
      await this.prisma.videoProcessingJob.update({ where: { id }, data: { status: 'PROCESSING', processingStage: 'PROBING', progress: 1, startedAt: new Date(), completedAt: null, errorMessage: null } });
      const expectedExtension = current.inputMediaFile.extension.toLowerCase() === '.mkv' ? '.mkv' : '.mp4';
      const metadata = localInput
        ? await this.probeLocalInput(inputPath, expectedExtension)
        : await probeMedia(inputPath, expectedExtension);
      const sourceWidth = metadata.width;
      const sourceHeight = metadata.height;
      const durationSec = metadata.durationSec;
      const profiles = selectVideoProfiles(sourceHeight, this.config.get<string>('HLS_PROFILES') ?? '360,480,720,1080');
      await this.assertDiskSpace(current.inputMediaFile.sizeBytes);
      await this.prisma.$transaction([
        this.prisma.videoProcessingJob.update({ where: { id }, data: { processingStage: 'PREPARING', progress: 3, sourceWidth, sourceHeight, durationSec, profiles, sourceFormat: metadata.container, sourceVideoCodec: metadata.videoCodec, sourceAudioCodecs: metadata.audioTracks.map((track) => track.codec), sourceMetadata: this.json(metadata), audioTracks: this.json(metadata.audioTracks), subtitleTracks: this.json(metadata.subtitleTracks) } }),
        this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.PROCESSING, errorMessage: null } }),
      ]);
      const segmentSeconds = this.segmentSeconds();
      for (let profileIndex = 0; profileIndex < profiles.length; profileIndex += 1) {
        await this.assertNotCancelled(id);
        const height = profiles[profileIndex];
        const profileDir = join(hlsRoot, String(height));
        await mkdir(profileDir, { recursive: true });
        await this.updateProgress(id, Math.max(4, Math.round(profileIndex / profiles.length * 82)), `GENERATING_HLS_${height}P`);
        const mayCopyVideo = canCopyVideo(metadata, height);
        const mayCopyAudio = canCopyPrimaryAudio(metadata);
        try {
          await this.generateVariant(id, inputPath, profileDir, height, segmentSeconds, durationSec, metadata, mayCopyVideo, mayCopyAudio, (profileProgress) => this.updateProgress(id, Math.min(88, Math.round((profileIndex + profileProgress / 100) / profiles.length * 84 + 4))));
          await this.validateVariant(profileDir, durationSec);
        } catch (error) {
          if (!mayCopyVideo && !mayCopyAudio) throw error;
          this.logger.warn(`La copia de streams para ${height}p no fue valida; se recodificara la variante`);
          await rm(profileDir, { recursive: true, force: true });
          await mkdir(profileDir, { recursive: true });
          await this.generateVariant(id, inputPath, profileDir, height, segmentSeconds, durationSec, metadata, false, false, (profileProgress) => this.updateProgress(id, Math.min(88, Math.round((profileIndex + profileProgress / 100) / profiles.length * 84 + 4))));
          await this.validateVariant(profileDir, durationSec);
        }
      }
      await this.assertNotCancelled(id);
      await this.updateProgress(id, 89, 'EXTRACTING_SUBTITLES');
      const extractedSubtitles = await this.extractSubtitles(id, inputPath, workRoot, metadata.subtitleTracks, uploadedKeys);
      await this.updateProgress(id, 90, 'GENERATING_THUMBNAIL');
      const thumbnailPath = join(workRoot, 'thumbnail.jpg');
      await this.runFfmpeg(id, ['-hide_banner', '-y', '-ss', String(Math.min(10, Math.max(0, durationSec * 0.1))), '-i', inputPath, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '2', thumbnailPath]);
      const masterPath = join(hlsRoot, 'master.m3u8');
      await writeFile(masterPath, masterPlaylist(sourceWidth, sourceHeight, profiles), 'utf8');
      await this.updateProgress(id, 92, 'VALIDATING');
      await this.validateHls(masterPath, hlsRoot, profiles, durationSec);
      if (this.storage.driverName === 's3') {
        for (const height of profiles) {
          const playlistPath = join(hlsRoot, String(height), 'index.m3u8');
          const playlist = await readFile(playlistPath, 'utf8');
          await writeFile(playlistPath, absoluteSegmentPlaylist(playlist, `/api/storage/objects/hls/${id}/${height}`), 'utf8');
        }
        await writeFile(masterPath, masterPlaylist(sourceWidth, sourceHeight, profiles, `/api/storage/objects/hls/${id}`), 'utf8');
      }

      const files = await this.walk(hlsRoot);
      const totalSize = (await Promise.all(files.map((path) => stat(path)))).reduce((sum, value) => sum + value.size, 0);
      for (let index = 0; index < files.length; index += 1) {
        await this.assertNotCancelled(id);
        const suffix = relative(hlsRoot, files[index]).replace(/\\/g, '/');
        const key = `hls/${id}/${suffix}`;
        await this.storage.putFile(key, files[index], { contentType: this.contentType(suffix) });
        uploadedKeys.push(key);
        await this.updateProgress(id, 92 + Math.round((index + 1) / (files.length + 1) * 6), 'UPLOADING_OUTPUT');
      }
      const thumbnailKey = `images/${id}-thumbnail.jpg`;
      const thumbnailSize = (await stat(thumbnailPath)).size;
      await this.storage.putFile(thumbnailKey, thumbnailPath, { contentType: 'image/jpeg' });
      uploadedKeys.push(thumbnailKey);
      const masterKey = `hls/${id}/master.m3u8`;
      const output = await this.prisma.$transaction(async (tx) => {
        const outputMedia = await tx.mediaFile.create({ data: { originalName: `${current.inputMediaFile.originalName} (HLS)`, storageName: `${id}-master.m3u8`, relativePath: masterKey, mimeType: 'application/vnd.apple.mpegurl', extension: '.m3u8', sizeBytes: BigInt(totalSize), mediaType: MediaType.VIDEO, status: MediaStatus.READY, width: sourceWidth, height: sourceHeight, durationSec, videoCodec: 'h264', audioCodec: metadata.audioTracks.length ? 'aac' : null } });
        await tx.mediaFile.create({ data: { originalName: `${current.inputMediaFile.originalName} (miniatura)`, storageName: `${id}-thumbnail.jpg`, relativePath: thumbnailKey, mimeType: 'image/jpeg', extension: '.jpg', sizeBytes: BigInt(thumbnailSize), mediaType: MediaType.IMAGE, status: MediaStatus.READY } });
        for (const subtitle of extractedSubtitles) await tx.mediaFile.create({ data: { originalName: subtitle.originalName, storageName: basename(subtitle.key), relativePath: subtitle.key, mimeType: 'text/vtt', extension: '.vtt', sizeBytes: BigInt(subtitle.size), mediaType: MediaType.SUBTITLE, status: MediaStatus.READY } });
        return tx.videoProcessingJob.update({ where: { id }, data: { outputMediaFileId: outputMedia.id, masterPath: masterKey, thumbnailPath: thumbnailKey, generatedQualities: profiles, subtitleTracks: this.json(extractedSubtitles.map(({ key: _key, size: _size, ...track }) => track)), status: 'COMPLETED', processingStage: 'AWAITING_ASSOCIATION', progress: 99, completedAt: new Date(), cancelRequested: false } });
      });
      const destination = await this.prisma.videoProcessingJob.findUnique({ where: { id }, select: { targetType: true, targetId: true } });
      if (destination?.targetType && destination.targetId) await this.associateOutput(id, destination.targetType, destination.targetId, masterKey, thumbnailKey, durationSec, extractedSubtitles);
      if (!output.retainOriginal && destination?.targetType && destination.targetId) await this.deleteOriginal(id, current.inputMediaFileId, current.inputMediaFile.relativePath);
      else await this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: MediaStatus.READY } });
      await this.prisma.videoProcessingJob.update({ where: { id }, data: { processingStage: 'COMPLETED', progress: 100 } });
      this.logger.log(`Procesamiento ${id} completado con perfiles ${profiles.join(',')}`);
    } catch (error) {
      await Promise.all(uploadedKeys.map((key) => this.storage.delete(key).catch(() => undefined)));
      const cancelled = error instanceof ProcessingCancelledError;
      const message = (cancelled ? 'Procesamiento cancelado por el administrador' : error instanceof Error ? error.message : 'Error desconocido de FFmpeg').slice(0, 500);
      await this.prisma.$transaction([
        this.prisma.videoProcessingJob.update({ where: { id }, data: { status: cancelled ? 'CANCELLED' : 'FAILED', processingStage: cancelled ? 'CANCELLED' : 'FAILED', errorMessage: message, completedAt: new Date(), cancelRequested: cancelled } }),
        this.prisma.mediaFile.update({ where: { id: current.inputMediaFileId }, data: { status: cancelled ? MediaStatus.READY : MediaStatus.FAILED, errorMessage: cancelled ? null : message } }),
      ]).catch(() => undefined);
      throw error;
    } finally { await rm(workRoot, { recursive: true, force: true }).catch(() => undefined); }
  }

  private async probeLocalInput(inputPath: string, extension: '.mp4' | '.mkv') {
    const attempts = 20;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await readdir(dirname(inputPath));
        return await probeMedia(inputPath, extension);
      } catch (error) {
        if (attempt === attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error('No se pudo analizar el archivo local');
  }

  private generateVariant(id: string, inputPath: string, profileDir: string, height: number, segmentSeconds: number, durationSec: number, metadata: MediaProbeMetadata, copyVideo: boolean, copyAudio: boolean, onProgress: (progress: number) => Promise<void>) {
    const args = ['-hide_banner', '-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?'];
    if (copyVideo) args.push('-c:v', 'copy');
    else args.push('-vf', `scale=-2:${height}`, '-c:v', 'libx264', '-preset', this.ffmpegPreset(), '-crf', String(this.ffmpegCrf()), '-pix_fmt', 'yuv420p', '-threads', String(this.ffmpegThreads()), '-force_key_frames', `expr:gte(t,n_forced*${segmentSeconds})`);
    if (metadata.audioTracks.length) {
      if (copyAudio) args.push('-c:a', 'copy');
      else args.push('-c:a', 'aac', '-b:a', this.audioBitrate(), '-ac', '2');
    }
    args.push('-sn', '-hls_time', String(segmentSeconds), '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments', '-hls_segment_filename', join(profileDir, 'segment-%05d.ts'), '-progress', 'pipe:1', '-nostats', join(profileDir, 'index.m3u8'));
    return this.runFfmpeg(id, args, durationSec, onProgress);
  }

  private async validateVariant(profileDir: string, sourceDuration: number) {
    const playlistPath = join(profileDir, 'index.m3u8');
    const playlist = await readFile(playlistPath, 'utf8').catch(() => '');
    const durations = [...playlist.matchAll(/^#EXTINF:([0-9.]+)/gm)].map((match) => Number(match[1]));
    if (!playlist.startsWith('#EXTM3U') || durations.length === 0 || durations.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error('FFmpeg genero una playlist HLS vacia o invalida');
    const segments = (await readdir(profileDir)).filter((name) => /^segment-\d{5}\.ts$/.test(name));
    if (!segments.length) throw new Error('FFmpeg no genero segmentos HLS');
    const segmentStats = await Promise.all(segments.map((name) => stat(join(profileDir, name))));
    if (segmentStats.some((value) => value.size === 0)) throw new Error('FFmpeg genero un segmento HLS vacio');
    const playlistDuration = durations.reduce((sum, value) => sum + value, 0);
    if (playlistDuration < Math.max(1, sourceDuration * 0.8)) throw new Error('La playlist HLS termina antes de la duracion esperada');
  }

  private async validateHls(masterPath: string, hlsRoot: string, profiles: number[], sourceDuration: number) {
    const master = await readFile(masterPath, 'utf8');
    if (!master.startsWith('#EXTM3U') || profiles.some((height) => !master.includes(`${height}/index.m3u8`))) throw new Error('El master.m3u8 no contiene todas las calidades generadas');
    for (const height of profiles) await this.validateVariant(join(hlsRoot, String(height)), sourceDuration);
    const duration = await this.probeOutputDuration(masterPath);
    if (!Number.isFinite(duration) || duration < Math.max(1, sourceDuration * 0.8)) throw new Error('FFprobe no pudo validar la duracion de la salida HLS');
  }

  private probeOutputDuration(path: string) {
    return new Promise<number>((resolve, reject) => {
      const child = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', '--', path], { windowsHide: true, shell: false });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('FFprobe excedio el tiempo limite al validar HLS')); }, 60_000);
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-1000); });
      child.once('error', () => { clearTimeout(timeout); reject(new Error('FFprobe no esta disponible para validar HLS')); });
      child.once('exit', (code) => { clearTimeout(timeout); if (code === 0) resolve(Number(stdout.trim())); else reject(new Error(`FFprobe rechazo la salida HLS: ${stderr}`)); });
    });
  }

  private async extractSubtitles(id: string, inputPath: string, workRoot: string, tracks: SubtitleTrackMetadata[], uploadedKeys: string[]) {
    const extracted: ExtractedSubtitle[] = [];
    for (const track of tracks.filter((value) => value.textBased)) {
      await this.assertNotCancelled(id);
      const localPath = join(workRoot, `subtitle-${track.index}.vtt`);
      try {
        await this.runFfmpeg(id, ['-hide_banner', '-y', '-i', inputPath, '-map', `0:${track.index}`, '-c:s', 'webvtt', localPath]);
        const size = (await stat(localPath)).size;
        if (!size) continue;
        const key = `subtitles/${id}-${track.index}.vtt`;
        await this.storage.putFile(key, localPath, { contentType: 'text/vtt; charset=utf-8' });
        uploadedKeys.push(key);
        extracted.push({ key, url: this.storage.publicUrl(key), language: track.language, label: track.title, originalName: `${basename(inputPath)}-${track.index}.vtt`, size });
      } catch (error) { if (error instanceof ProcessingCancelledError) throw error; this.logger.warn(`No se pudo extraer el subtitulo ${track.index}: ${error instanceof Error ? error.message : 'error desconocido'}`); }
    }
    return extracted;
  }

  private async associateOutput(id: string, targetType: VideoProcessingTargetType, targetId: string, masterKey: string, thumbnailKey: string, durationSec: number, subtitles: ExtractedSubtitle[]) {
    const videoUrl = this.storage.publicUrl(masterKey);
    const thumbnailUrl = this.storage.publicUrl(thumbnailKey);
    await this.prisma.$transaction(async (tx) => {
      if (targetType === VideoProcessingTargetType.EPISODE) {
        await tx.episode.update({ where: { id: targetId }, data: { videoSource: 'HLS', videoType: 'HLS', videoUrl, processedVideoUrl: videoUrl, thumbnailUrl, durationSec: Math.round(durationSec) } });
      } else {
        await tx.movie.update({ where: { id: targetId }, data: { videoSource: 'HLS', videoType: 'HLS', videoUrl, processedVideoUrl: videoUrl, posterUrl: thumbnailUrl, duration: Math.max(1, Math.round(durationSec / 60)) } });
      }
      for (const [index, subtitle] of subtitles.entries()) {
        const target = targetType === VideoProcessingTargetType.EPISODE ? { episodeId: targetId } : { movieId: targetId };
        const exists = await tx.subtitleTrack.count({ where: { ...target, language: subtitle.language, url: subtitle.url } });
        if (!exists) await tx.subtitleTrack.create({ data: { ...target, language: subtitle.language, label: subtitle.label, url: subtitle.url, originalName: subtitle.originalName, sourceFormat: 'VTT', isDefault: index === 0, isActive: true } });
      }
      await tx.videoProcessingJob.updateMany({ where: { id, targetType, targetId }, data: { associatedAt: new Date() } });
    });
  }

  private async deleteOriginal(id: string, mediaId: string, relativePath: string) {
    try {
      await this.storage.delete(relativePath);
      await this.prisma.mediaFile.update({ where: { id: mediaId }, data: { status: MediaStatus.DELETED, errorMessage: null } });
    } catch (error) {
      const message = `HLS listo; no se pudo eliminar el original: ${error instanceof Error ? error.message : 'error desconocido'}`.slice(0, 500);
      await this.prisma.videoProcessingJob.update({ where: { id }, data: { retainOriginal: true, errorMessage: message } });
      await this.prisma.mediaFile.update({ where: { id: mediaId }, data: { status: MediaStatus.READY } });
    }
  }

  private async assertDiskSpace(originalSize: bigint) {
    const available = await this.storage.freeBytes();
    if (available === null) return;
    const margin = BigInt(512 * 1024 * 1024);
    const required = originalSize * BigInt(3) + margin;
    if (available < required) throw new Error(`Espacio insuficiente para procesar el video. Requerido: ${required} bytes; disponible: ${available} bytes`);
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

  private async updateProgress(id: string, progress: number, processingStage?: string) { await this.prisma.videoProcessingJob.updateMany({ where: { id, status: 'PROCESSING' }, data: { progress: Math.max(1, Math.min(99, progress)), processingStage } }); }
  private async isCancelled(id: string) { return Boolean((await this.prisma.videoProcessingJob.findUnique({ where: { id }, select: { cancelRequested: true } }))?.cancelRequested); }
  private async assertNotCancelled(id: string) { if (await this.isCancelled(id)) throw new ProcessingCancelledError(); }
  private segmentSeconds() { const value = Number(this.config.get<string>('HLS_SEGMENT_DURATION') ?? this.config.get<string>('HLS_SEGMENT_SECONDS') ?? 6); return Number.isInteger(value) && value >= 2 && value <= 15 ? value : 6; }
  private ffmpegPreset() { const value = this.config.get<string>('FFMPEG_PRESET') ?? 'veryfast'; return ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'].includes(value) ? value : 'veryfast'; }
  private ffmpegCrf() { const value = Number(this.config.get<string>('FFMPEG_CRF') ?? 21); return Number.isInteger(value) && value >= 16 && value <= 32 ? value : 21; }
  private ffmpegThreads() { const value = Number(this.config.get<string>('FFMPEG_THREADS') ?? 2); return Number.isInteger(value) && value >= 1 && value <= 8 ? value : 2; }
  private audioBitrate() { const value = this.config.get<string>('FFMPEG_AUDIO_BITRATE') ?? '192k'; return /^\d{2,3}k$/.test(value) ? value : '192k'; }
  private json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
  private contentType(path: string) { return path.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : path.endsWith('.ts') ? 'video/mp2t' : 'application/octet-stream'; }
  private async walk(root: string): Promise<string[]> { const entries = await readdir(root, { withFileTypes: true }); const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? this.walk(join(root, entry.name)) : Promise.resolve([join(root, entry.name)]))); return nested.flat().sort(); }
}
