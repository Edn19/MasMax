import { BadRequestException, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { open, stat } from 'fs/promises';
import { extname } from 'path';

export type ProbeStream = {
  index: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  channels?: number;
  tags?: { language?: string; title?: string };
};

type RawProbeResult = {
  format?: { format_name?: string; duration?: string; bit_rate?: string; size?: string };
  streams?: ProbeStream[];
};

export type AudioTrackMetadata = { index: number; codec: string; language: string; title: string; channels: number };
export type SubtitleTrackMetadata = { index: number; codec: string; language: string; title: string; textBased: boolean };
export type MediaProbeMetadata = {
  container: 'mp4' | 'matroska';
  formatName: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number | null;
  bitrate: number | null;
  videoCodec: string;
  videoProfile: string | null;
  pixelFormat: string | null;
  audioTracks: AudioTrackMetadata[];
  subtitleTracks: SubtitleTrackMetadata[];
  streamCount: number;
  fastStart: boolean | null;
};

export type AllowedVideoExtension = '.mp4' | '.mkv' | '.mov' | '.webm';
export const allowedVideoExtensions = ['.mp4', '.mkv', '.mov', '.webm'] as const;
export const allowedVideoMimeTypes = ['video/mp4', 'application/mp4', 'video/quicktime', 'video/matroska', 'video/x-matroska', 'application/x-matroska', 'video/webm', 'application/octet-stream', ''] as const;
const allowedExtensionSet = new Set<string>(allowedVideoExtensions);
const allowedMimeTypeSet = new Set<string>(allowedVideoMimeTypes);
const textSubtitleCodecs = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text']);
const probeLogger = new Logger('MediaProbe');

export function isAllowedVideoUploadIdentity(originalName: string, mimeType: string) {
  const extension = extname(originalName).toLowerCase();
  const normalizedMime = (mimeType ?? '').trim().toLowerCase();
  return allowedExtensionSet.has(extension) && allowedMimeTypeSet.has(normalizedMime);
}

export function validateUploadIdentity(originalName: string, mimeType: string) {
  if (/[\\/]/.test(originalName)) throw new BadRequestException('El nombre del archivo no puede contener rutas');
  const extension = extname(originalName).toLowerCase();
  const normalizedMime = (mimeType ?? '').trim().toLowerCase();
  if (!allowedExtensionSet.has(extension) || !allowedMimeTypeSet.has(normalizedMime)) throw new BadRequestException('El tipo de archivo no es compatible. Usa MP4, MKV, MOV o WebM.');
  return { extension: extension as AllowedVideoExtension, mimeType: normalizedMime };
}

export async function assertContainerSignature(path: string, extension: AllowedVideoExtension) {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead < 8) throw new BadRequestException('El archivo no contiene un video MP4 o MKV valido.');
    const valid = extension === '.mp4' || extension === '.mov'
      ? buffer.subarray(4, 8).toString('ascii') === 'ftyp'
      : buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!valid) throw new BadRequestException('La firma del contenedor de video no coincide con el archivo enviado.');
  } finally { await handle.close(); }
}

export async function probeMedia(path: string, expectedExtension?: AllowedVideoExtension): Promise<MediaProbeMetadata> {
  const raw = await runFfprobe(path);
  const streams = raw.streams ?? [];
  if (streams.length === 0 || streams.length > 64) throw new BadRequestException('El archivo tiene una cantidad de streams no valida');
  const video = streams.find((stream) => stream.codec_type === 'video');
  if (!video?.codec_name || !video.width || !video.height) throw new BadRequestException('El archivo no contiene una pista de video valida');
  const durationSec = Number(raw.format?.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 86_400) throw new BadRequestException('La duracion del video no es valida');
  if (video.width < 16 || video.height < 16 || video.width > 7680 || video.height > 4320) throw new BadRequestException('La resolucion del video no es valida');
  const formatName = raw.format?.format_name?.toLowerCase() ?? '';
  const container = detectContainer(formatName);
  const expectedContainer = expectedExtension === '.mp4' || expectedExtension === '.mov' ? 'mp4' : expectedExtension ? 'matroska' : null;
  if (!container || (expectedContainer && container !== expectedContainer)) {
    throw new BadRequestException('El contenedor detectado por ffprobe no coincide con el archivo enviado');
  }
  return {
    container,
    formatName,
    durationSec,
    width: video.width,
    height: video.height,
    fps: parseFrameRate(video.avg_frame_rate || video.r_frame_rate),
    bitrate: positiveNumber(raw.format?.bit_rate),
    videoCodec: video.codec_name.toLowerCase(),
    videoProfile: video.profile?.toLowerCase() ?? null,
    pixelFormat: video.pix_fmt?.toLowerCase() ?? null,
    audioTracks: streams.filter((stream) => stream.codec_type === 'audio').map((stream) => ({ index: stream.index, codec: stream.codec_name?.toLowerCase() ?? 'unknown', language: stream.tags?.language?.toLowerCase() || 'und', title: stream.tags?.title?.trim() || 'Audio principal', channels: stream.channels ?? 0 })),
    subtitleTracks: streams.filter((stream) => stream.codec_type === 'subtitle').map((stream) => { const codec = stream.codec_name?.toLowerCase() ?? 'unknown'; return { index: stream.index, codec, language: stream.tags?.language?.toLowerCase() || 'und', title: stream.tags?.title?.trim() || 'Subtitulos', textBased: textSubtitleCodecs.has(codec) }; }),
    streamCount: streams.length,
    fastStart: container === 'mp4' ? await detectMp4FastStart(path) : null,
  };
}

export async function detectMp4FastStart(path: string): Promise<boolean | null> {
  const size = (await stat(path)).size;
  const handle = await open(path, 'r');
  try {
    let offset = 0;
    let sawMdat = false;
    for (let boxes = 0; boxes < 256 && offset + 8 <= size; boxes += 1) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, header.length, offset);
      if (bytesRead < 8) return null;
      const type = header.subarray(4, 8).toString('ascii');
      let boxSize = Number(header.readUInt32BE(0));
      let headerSize = 8;
      if (boxSize === 1) {
        if (bytesRead < 16) return null;
        const extended = header.readBigUInt64BE(8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        boxSize = Number(extended);
        headerSize = 16;
      } else if (boxSize === 0) boxSize = size - offset;
      if (boxSize < headerSize || offset + boxSize > size) return null;
      if (type === 'moov') return !sawMdat;
      if (type === 'mdat') sawMdat = true;
      offset += boxSize;
    }
    return null;
  } finally { await handle.close(); }
}

export function canCopyVideo(metadata: MediaProbeMetadata, targetHeight: number) {
  const compatibleProfile = !metadata.videoProfile || ['baseline', 'constrained baseline', 'main', 'high'].includes(metadata.videoProfile);
  return metadata.videoCodec === 'h264' && metadata.height === targetHeight && compatibleProfile && ['yuv420p', 'yuvj420p'].includes(metadata.pixelFormat ?? '');
}

export function canCopyPrimaryAudio(metadata: MediaProbeMetadata) {
  const primary = metadata.audioTracks[0];
  return Boolean(primary && primary.codec === 'aac' && primary.channels > 0 && primary.channels <= 6);
}

function detectContainer(formatName: string): 'mp4' | 'matroska' | null {
  const formats = formatName.split(',');
  if (formats.some((format) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(format))) return 'mp4';
  if (formats.some((format) => ['matroska', 'webm'].includes(format))) return 'matroska';
  return null;
}

function parseFrameRate(value?: string) {
  if (!value) return null;
  const [numerator, denominator = 1] = value.split('/').map(Number);
  const result = numerator / denominator;
  return Number.isFinite(result) && result > 0 && result <= 240 ? Math.round(result * 1000) / 1000 : null;
}

function positiveNumber(value?: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }

function runFfprobe(path: string) {
  return new Promise<RawProbeResult>((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '--', path], { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill('SIGKILL'); probeLogger.warn(JSON.stringify({ event: 'ffprobe_timeout' })); reject(new BadRequestException('No se pudo analizar el video. El archivo puede estar danado.')); }, 60_000);
    child.stdout.on('data', (data: Buffer) => { if (stdout.length <= 4_000_000) stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr = `${stderr}${data.toString()}`.slice(-4000); });
    child.once('error', (error) => { clearTimeout(timeout); probeLogger.error(JSON.stringify({ event: 'ffprobe_unavailable', error: error.message })); reject(new BadRequestException('No se pudo analizar el video. El archivo puede estar danado.')); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) { probeLogger.warn(JSON.stringify({ event: 'ffprobe_rejected', exitCode: code, detail: stderr.replace(/\s+/g, ' ').trim().slice(-500) })); reject(new BadRequestException('No se pudo analizar el video. El archivo puede estar danado.')); return; }
      try { resolve(JSON.parse(stdout) as RawProbeResult); }
      catch { probeLogger.warn(JSON.stringify({ event: 'ffprobe_invalid_json' })); reject(new BadRequestException('No se pudo analizar el video. El archivo puede estar danado.')); }
    });
  });
}
