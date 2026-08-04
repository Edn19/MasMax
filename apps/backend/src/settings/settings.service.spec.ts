import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from './settings.service';

describe('SettingsService singleton', () => {
  it('usa upsert sobre la clave default al inicializar concurrentemente', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'setting', key: 'default' });
    const service = new SettingsService({ siteSetting: { upsert } } as never);
    await Promise.all([service.get(), service.get()]);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({ where: { key: 'default' }, create: { key: 'default' }, update: {} });
  });
});
