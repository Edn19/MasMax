import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { allowedVideoExtensions, allowedVideoMimeTypes, assertContainerSignature, canCopyPrimaryAudio, canCopyVideo, detectMp4FastStart, isAllowedVideoUploadIdentity, MediaProbeMetadata, validateUploadIdentity } from './media-probe';

const metadata: MediaProbeMetadata = { container: 'matroska', formatName: 'matroska,webm', durationSec: 60, width: 1920, height: 1080, fps: 24, bitrate: 4_000_000, videoCodec: 'h264', videoProfile: 'high', pixelFormat: 'yuv420p', audioTracks: [{ index: 1, codec: 'aac', language: 'spa', title: 'Espanol', channels: 2 }], subtitleTracks: [], streamCount: 2, fastStart: null };

describe('media probe policy', () => {
  it('accepts MP4 and all supported Matroska browser MIME variants', () => {
    for (const mimeType of ['video/matroska', 'video/x-matroska', 'application/x-matroska', 'application/octet-stream']) {
      expect(validateUploadIdentity('movie.MKV', mimeType).extension).toBe('.mkv');
      expect(isAllowedVideoUploadIdentity('movie.mkv', mimeType)).toBe(true);
    }
    expect(validateUploadIdentity('episode.mp4', 'video/mp4').extension).toBe('.mp4');
    expect(validateUploadIdentity('episode.mp4', 'application/mp4').extension).toBe('.mp4');
    expect(allowedVideoExtensions).toEqual(['.mp4', '.mkv', '.mov', '.webm']);
    expect(validateUploadIdentity('episode.mov', 'video/quicktime').extension).toBe('.mov');
    expect(validateUploadIdentity('episode.webm', 'video/webm').extension).toBe('.webm');
    expect(allowedVideoMimeTypes).toContain('video/matroska');
  });
  it('rejects unsupported extensions and paths', () => {
    expect(() => validateUploadIdentity('movie.avi', 'video/avi')).toThrow(BadRequestException);
    expect(() => validateUploadIdentity('movie.mkv', 'video/avi')).toThrow('tipo de archivo no es compatible');
    expect(() => validateUploadIdentity('movie.avi', 'video/matroska')).toThrow('tipo de archivo no es compatible');
    expect(() => validateUploadIdentity('../movie.mkv', 'video/x-matroska')).toThrow(BadRequestException);
  });
  it('copies only a compatible source-height H.264 rendition', () => {
    expect(canCopyVideo(metadata, 1080)).toBe(true);
    expect(canCopyVideo(metadata, 720)).toBe(false);
    expect(canCopyVideo({ ...metadata, videoCodec: 'hevc' }, 1080)).toBe(false);
    expect(canCopyVideo({ ...metadata, pixelFormat: 'yuv420p10le' }, 1080)).toBe(false);
  });
  it('copies AAC and transcodes DTS or missing audio', () => {
    expect(canCopyPrimaryAudio(metadata)).toBe(true);
    expect(canCopyPrimaryAudio({ ...metadata, audioTracks: [{ ...metadata.audioTracks[0], codec: 'dts' }] })).toBe(false);
    expect(canCopyPrimaryAudio({ ...metadata, audioTracks: [] })).toBe(false);
  });
  it('checks MP4 and EBML signatures instead of trusting the extension', async () => {
    const root = join(tmpdir(), `masmax-signature-${randomUUID()}`);
    const mp4 = `${root}.mp4`;
    const mkv = `${root}.mkv`;
    const fake = `${root}-fake.mkv`;
    await writeFile(mp4, Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(8)]));
    await writeFile(mkv, Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]));
    await writeFile(fake, Buffer.from('not a matroska file'));
    try {
      await expect(assertContainerSignature(mp4, '.mp4')).resolves.toBeUndefined();
      await expect(assertContainerSignature(mkv, '.mkv')).resolves.toBeUndefined();
      await expect(assertContainerSignature(fake, '.mkv')).rejects.toThrow('firma del contenedor');
    } finally { await Promise.all([mp4, mkv, fake].map((path) => rm(path, { force: true }))); }
  });
  it('detecta fast start sin cargar el MP4 completo en memoria', async () => {
    const root = join(tmpdir(), `masmax-faststart-${randomUUID()}`);
    const fast = `${root}-fast.mp4`;
    const slow = `${root}-slow.mp4`;
    const box = (type: string) => { const value = Buffer.alloc(8); value.writeUInt32BE(8, 0); value.write(type, 4, 4, 'ascii'); return value; };
    await writeFile(fast, Buffer.concat([box('ftyp'), box('moov'), box('mdat')]));
    await writeFile(slow, Buffer.concat([box('ftyp'), box('mdat'), box('moov')]));
    try {
      await expect(detectMp4FastStart(fast)).resolves.toBe(true);
      await expect(detectMp4FastStart(slow)).resolves.toBe(false);
    } finally { await Promise.all([fast, slow].map((path) => rm(path, { force: true }))); }
  });
});
