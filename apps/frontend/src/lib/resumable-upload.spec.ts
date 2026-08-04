import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryableUploadError, matchesResumableFile, resumableChunkMimeType, retryDelayMs, type ResumableFileIdentity } from './resumable-upload-policy';

const session: ResumableFileIdentity = { originalName: 'movie.mkv', size: 915_000_000, mimeType: 'video/x-matroska', lastModified: 1234 };

test('matches a resumable file using name, size, MIME and last modified time', () => {
  assert.equal(matchesResumableFile(session, { name: 'movie.mkv', size: 915_000_000, type: 'video/x-matroska', lastModified: 1234 }), true);
  assert.equal(matchesResumableFile(session, { name: 'movie.mkv', size: 915_000_000, type: 'video/x-matroska', lastModified: 9999 }), false);
});

test('only retries network, timeout, throttling and recoverable server errors', () => {
  for (const status of [0, 408, 429, 500, 502, 503, 504]) assert.equal(isRetryableUploadError({ status }), true);
  for (const status of [400, 401, 403, 404, 409, 413]) assert.equal(isRetryableUploadError({ status }), false);
});

test('uses capped exponential backoff with jitter', () => {
  assert.equal(retryDelayMs(1, 0), 1000);
  assert.equal(retryDelayMs(2, 0), 2000);
  assert.equal(retryDelayMs(5, 0), 16000);
  assert.equal(retryDelayMs(6, 0.5), 16125);
});

test('preserves the MKV MIME in chunks and never forces video/mp4', () => {
  assert.equal(resumableChunkMimeType('video/matroska'), 'video/matroska');
  assert.equal(resumableChunkMimeType('video/x-matroska'), 'video/x-matroska');
  assert.equal(resumableChunkMimeType(''), 'application/octet-stream');
});
