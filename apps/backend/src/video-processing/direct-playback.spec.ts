import { describe, expect, it } from 'vitest';
import { directPlaybackCompatibility } from './direct-playback';

describe('direct playback compatibility', () => {
  it('acepta MP4 H.264/AAC y conserva la advertencia de fast start', () => {
    expect(directPlaybackCompatibility({ extension: '.mp4', videoCodec: 'h264', audioCodec: 'aac', probeMetadata: { fastStart: true } })).toMatchObject({ compatible: true, fastStart: true });
    expect(directPlaybackCompatibility({ extension: '.mp4', videoCodec: 'h264', audioCodec: 'aac', probeMetadata: { fastStart: false } }).message).toContain('inicio rapido');
  });

  it('no declara compatibles MKV, HEVC ni DTS', () => {
    expect(directPlaybackCompatibility({ extension: '.mkv', videoCodec: 'h264', audioCodec: 'aac' }).compatible).toBe(false);
    expect(directPlaybackCompatibility({ extension: '.mp4', videoCodec: 'hevc', audioCodec: 'aac' }).compatible).toBe(false);
    expect(directPlaybackCompatibility({ extension: '.mp4', videoCodec: 'h264', audioCodec: 'dts' }).compatible).toBe(false);
  });
});
