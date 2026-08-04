import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPlayerPreferences, normalizePlayerPreferences } from './player-preferences';

test('uses defaults for malformed preferences', () => {
  assert.deepEqual(normalizePlayerPreferences(null), defaultPlayerPreferences);
  assert.deepEqual(normalizePlayerPreferences({ speed: 9, quality: -1 }), defaultPlayerPreferences);
});

test('clamps volume and preserves supported values', () => {
  assert.deepEqual(normalizePlayerPreferences({ volume: 2, speed: 1.5, quality: 1080, autoplayNext: false }), {
    volume: 1,
    speed: 1.5,
    quality: 1080,
    autoplayNext: false,
  });
});
