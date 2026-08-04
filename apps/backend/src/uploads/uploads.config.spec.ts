import { describe, expect, it } from 'vitest';
import { parseUploadsConfig } from './uploads.config';

const MIB = 1024 * 1024;

describe('resumable upload configuration', () => {
  it('supports 8 MiB and 16 MiB chunks with request overhead', () => {
    expect(parseUploadsConfig({ RESUMABLE_CHUNK_SIZE_MB: '8' }).resumableChunkRequestLimitBytes).toBe(10 * MIB);
    const config = parseUploadsConfig({ RESUMABLE_CHUNK_SIZE_MB: '16', RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB: '3' });
    expect(config.resumableChunkSizeBytes).toBe(16 * MIB);
    expect(config.resumableChunkRequestLimitBytes).toBe(19 * MIB);
  });

  it('keeps Multer above an exact 16 MiB part and below larger abusive files', () => {
    const config = parseUploadsConfig({ RESUMABLE_CHUNK_SIZE_MB: '16', RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB: '2' });
    expect(config.resumableChunkRequestLimitBytes).toBeGreaterThan(16 * MIB);
    expect(config.resumableChunkRequestLimitBytes).toBe(18 * MIB);
    expect(19 * MIB).toBeGreaterThan(config.resumableChunkRequestLimitBytes);
  });

  it('rejects invalid, unsafe and inconsistent values', () => {
    expect(() => parseUploadsConfig({ RESUMABLE_CHUNK_SIZE_MB: '0' })).toThrow('RESUMABLE_CHUNK_SIZE_MB');
    expect(() => parseUploadsConfig({ RESUMABLE_CHUNK_SIZE_MB: '65' })).toThrow('RESUMABLE_CHUNK_SIZE_MB');
    expect(() => parseUploadsConfig({ RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB: '0' })).toThrow('RESUMABLE_CHUNK_REQUEST_OVERHEAD_MB');
    expect(() => parseUploadsConfig({ RESUMABLE_UPLOAD_MAX_RETRIES: 'NaN' })).toThrow('RESUMABLE_UPLOAD_MAX_RETRIES');
    expect(() => parseUploadsConfig({ MAX_VIDEO_UPLOAD_MB: '16', RESUMABLE_CHUNK_SIZE_MB: '16' })).toThrow('MAX_VIDEO_UPLOAD_MB');
  });

  it('ignores the historical misspelled variable', () => {
    const config = parseUploadsConfig({ RESUMABLECHUNK_SIZE_MB: '32' });
    expect(config.resumableChunkSizeBytes).toBe(16 * MIB);
  });
});
