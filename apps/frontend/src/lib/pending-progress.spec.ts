import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearPendingProgress, readPendingProgress, storePendingProgress } from './pending-progress';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });

describe('pending progress', () => {
  beforeEach(() => values.clear());
  it('conserva un progreso pendiente mas reciente', () => {
    storePendingProgress({ episodeId: 'e', positionSec: 30, durationSec: 100, completed: false });
    clearPendingProgress({ episodeId: 'e', positionSec: 20, durationSec: 100, completed: false });
    assert.equal(readPendingProgress()?.positionSec, 30);
  });
  it('elimina el progreso confirmado', () => {
    const payload = { movieId: 'm', positionSec: 30, durationSec: 100, completed: false };
    storePendingProgress(payload);
    clearPendingProgress(payload);
    assert.equal(readPendingProgress(), null);
  });
});
