import { describe, expect, it } from 'vitest';
import { normalizeStorageKey } from './storage.types';
import { LocalStorageDriver } from './local-storage.driver';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('normalizeStorageKey', () => {
  it('normaliza separadores y la barra inicial', () => expect(normalizeStorageKey('/images\\cover.webp')).toBe('images/cover.webp'));
  it.each(['', '../secret', 'images/../secret', 'images//cover.webp'])('rechaza claves peligrosas: %s', (value) => expect(() => normalizeStorageKey(value)).toThrow());
});

describe('LocalStorageDriver', () => {
  it('escribe, lee, inspecciona y elimina objetos', async () => {
    const root = await mkdtemp(join(tmpdir(), 'masmax-storage-'));
    const driver = new LocalStorageDriver({ get: (key: string) => key === 'LOCAL_STORAGE_PATH' ? root : undefined } as never);
    try {
      await driver.putBuffer('images/test.png', Buffer.from('demo'));
      expect(await driver.exists('images/test.png')).toBe(true);
      expect((await driver.metadata('images/test.png'))?.size).toBe(4);
      expect((await driver.read('images/test.png')).toString()).toBe('demo');
      expect(await driver.temporaryUrl('images/test.png', 60)).toBe('/uploads/images/test.png');
      await driver.delete('images/test.png');
      expect(await driver.exists('images/test.png')).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('copia archivos al destino final y elimina el temporal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'masmax-storage-'));
    const source = join(root, 'source.upload');
    const driver = new LocalStorageDriver({ get: (key: string) => key === 'LOCAL_STORAGE_PATH' ? root : undefined } as never);
    try {
      await writeFile(source, 'video-demo');
      await driver.putFile('videos/demo.mkv', source);
      expect((await driver.read('videos/demo.mkv')).toString()).toBe('video-demo');
      await expect(driver.metadata('source.upload')).resolves.toBeNull();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
