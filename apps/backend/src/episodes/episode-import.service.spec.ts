import { describe, expect, it } from 'vitest';
import { inferVideoConfiguration, parsePublished } from './episode-import.service';

describe('CSV episode import helpers', () => {
  it('infiere fuentes compatibles desde la URL', () => {
    expect(inferVideoConfiguration('/uploads/videos/demo.mp4')).toEqual({ videoSource: 'LOCAL', videoType: 'MP4' });
    expect(inferVideoConfiguration('https://cdn.example.com/show/master.m3u8')).toEqual({ videoSource: 'HLS', videoType: 'HLS' });
    expect(inferVideoConfiguration('https://drive.google.com/file/d/demo/view')).toEqual({ videoSource: 'DRIVE', videoType: 'DRIVE' });
  });

  it('normaliza valores de publicacion y rechaza valores ambiguos', () => {
    expect(parsePublished('si')).toBe(true);
    expect(parsePublished('0')).toBe(false);
    expect(() => parsePublished('quizas')).toThrow('published debe ser');
  });
});
