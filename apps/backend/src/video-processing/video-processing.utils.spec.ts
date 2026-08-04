import { describe, expect, it } from 'vitest';
import { absoluteSegmentPlaylist, masterPlaylist, scaledWidth, selectVideoProfiles } from './video-processing.utils';

describe('video processing helpers', () => {
  it('never selects a profile above the source', () => {
    expect(selectVideoProfiles(720, '360,480,720,1080')).toEqual([360, 480, 720]);
    expect(selectVideoProfiles(240, '360,480')).toEqual([240]);
  });

  it('keeps calculated widths even', () => {
    expect(scaledWidth(1920, 1080, 720)).toBe(1280);
    expect(scaledWidth(853, 480, 360) % 2).toBe(0);
  });

  it('creates a master manifest with every variant', () => {
    const manifest = masterPlaylist(1920, 1080, [360, 720]);
    expect(manifest).toContain('RESOLUTION=640x360');
    expect(manifest).toContain('720/index.m3u8');
  });

  it('rewrites private S3 segment references through the API', () => {
    expect(absoluteSegmentPlaylist('#EXTM3U\nsegment-00001.ts\n', '/api/storage/objects/hls/job/360')).toContain('/api/storage/objects/hls/job/360/segment-00001.ts');
  });
});
