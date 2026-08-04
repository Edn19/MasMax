import { describe, expect, it } from 'vitest';
import { expectedPartSize, mergeUploadedPart, totalPartsFor } from './resumable-upload.utils';

describe('resumable upload helpers', () => {
  it('calculates complete and final partial chunk sizes', () => {
    expect(expectedPartSize(20, 8, 3, 0)).toBe(8);
    expect(expectedPartSize(20, 8, 3, 1)).toBe(8);
    expect(expectedPartSize(20, 8, 3, 2)).toBe(4);
    expect(expectedPartSize(8, 8, 1, 0)).toBe(8);
    expect(expectedPartSize(16, 8, 2, 1)).toBe(8);
    expect(() => expectedPartSize(20, 8, 3, 3)).toThrow('fuera de rango');
  });

  it('keeps confirmed parts unique and ordered for retries', () => {
    expect(mergeUploadedPart([2, 0], 1)).toEqual([0, 1, 2]);
    expect(mergeUploadedPart([0, 1], 1)).toEqual([0, 1]);
  });

  it('splits a 915 MB file instead of treating it as one part', () => {
    expect(totalPartsFor(915 * 1024 * 1024, 16 * 1024 * 1024)).toBe(58);
    expect(totalPartsFor(40 * 1024 * 1024, 16 * 1024 * 1024)).toBe(3);
    expect(totalPartsFor(20 * 1024 * 1024, 8 * 1024 * 1024)).toBe(3);
  });
});
