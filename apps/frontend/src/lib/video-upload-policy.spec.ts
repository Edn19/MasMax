import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedVideoInput, validateVideoSelection } from './video-upload-policy';

test('video input advertises all admitted containers', () => {
  assert.equal(acceptedVideoInput, '.mp4,.mkv,.mov,.webm,video/mp4,application/mp4,video/quicktime,video/matroska,video/x-matroska,application/x-matroska,video/webm');
});

test('video selection accepts Matroska browser MIME fallbacks', () => {
  for (const type of ['video/matroska', 'video/x-matroska', 'application/x-matroska', 'application/octet-stream']) {
    assert.equal(validateVideoSelection({ name: 'movie.MKV', type, size: 1024 }, 2048), null);
  }
  assert.equal(validateVideoSelection({ name: 'movie.mkv', type: '', size: 1024 }, 2048), null);
  assert.equal(validateVideoSelection({ name: 'movie.mp4', type: 'video/mp4', size: 1024 }, 2048), null);
});

test('video selection rejects unsupported, empty and oversized files', () => {
  assert.match(validateVideoSelection({ name: 'movie.avi', type: 'video/avi', size: 1024 }, 2048) ?? '', /tipo de archivo no es compatible/);
  assert.match(validateVideoSelection({ name: 'movie.mkv', type: 'video/avi', size: 1024 }, 2048) ?? '', /tipo de archivo no es compatible/);
  assert.match(validateVideoSelection({ name: 'movie.mkv', type: 'video\/x-matroska', size: 0 }, 2048) ?? '', /vacio/);
  assert.match(validateVideoSelection({ name: 'movie.mp4', type: 'video\/mp4', size: 3 * 1024 * 1024 }, 2) ?? '', /limite/);
});
