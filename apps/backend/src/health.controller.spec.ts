import { describe, expect, it, vi } from 'vitest';
import { CachedCommandAvailability } from './health.controller';

describe('CachedCommandAvailability', () => {
  it('ejecuta la comprobacion una sola vez', async () => {
    const runner = vi.fn().mockResolvedValue(true);
    const capability = new CachedCommandAvailability('ffprobe', runner);
    await Promise.all([capability.get(), capability.get(), capability.get()]);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
