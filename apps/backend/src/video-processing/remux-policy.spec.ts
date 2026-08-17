import { describe, expect, it } from 'vitest';
import { planMp4Remux } from './remux-policy';
import { MediaProbeMetadata } from './media-probe';

const metadata = (videoCodec: string, audioCodec = 'aac'): MediaProbeMetadata => ({
  container: 'matroska', formatName: 'matroska,webm', durationSec: 60, width: 1920, height: 1080,
  fps: 24, bitrate: 2_000_000, videoCodec, videoProfile: 'high', pixelFormat: 'yuv420p',
  audioTracks: [{ index: 1, codec: audioCodec, language: 'und', title: 'Audio', channels: 2 }],
  subtitleTracks: [], streamCount: 2, fastStart: null,
});

describe('planMp4Remux', () => {
  it('copies H.264 and AAC without recoding', () => expect(planMp4Remux(metadata('h264', 'aac'))).toMatchObject({ allowed: true, copyVideo: true, copyAudio: true }));
  it('copies H.264 and converts incompatible audio only', () => expect(planMp4Remux(metadata('h264', 'dts'))).toMatchObject({ allowed: true, copyVideo: true, copyAudio: false, audioCodec: 'aac' }));
  it('rejects video codecs that would require video transcoding', () => expect(planMp4Remux(metadata('hevc', 'aac'))).toMatchObject({ allowed: false, copyVideo: false }));
});
