import { describe, expect, it } from 'vitest';
import { expectedPartSize, mergeUploadedPart } from './resumable-upload.utils';

describe('resumable upload helpers', () => {
  it('calculates complete and final partial chunk sizes', () => {
    expect(expectedPartSize(20, 8, 3, 0)).toBe(8);
    expect(expectedPartSize(20, 8, 3, 2)).toBe(4);
    expect(expectedPartSize(8, 8, 1, 0)).toBe(8);
  });

  it('keeps confirmed parts unique and ordered for retries', () => {
    expect(mergeUploadedPart([2, 0], 1)).toEqual([0, 1, 2]);
    expect(mergeUploadedPart([0, 1], 1)).toEqual([0, 1]);
  });
});
