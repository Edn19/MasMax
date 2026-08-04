import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_DRIVER, StorageDriver, StorageWriteOptions, normalizeStorageKey } from './storage.types';

@Injectable()
export class ObjectStorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}
  get driverName() { return this.driver.name; }
  putFile(key: string, sourcePath: string, options?: StorageWriteOptions) { return this.driver.putFile(normalizeStorageKey(key), sourcePath, options); }
  putBuffer(key: string, content: Buffer, options?: StorageWriteOptions) { return this.driver.putBuffer(normalizeStorageKey(key), content, options); }
  downloadToFile(key: string, destinationPath: string) { return this.driver.downloadToFile(normalizeStorageKey(key), destinationPath); }
  read(key: string) { return this.driver.read(normalizeStorageKey(key)); }
  delete(key: string) { return this.driver.delete(normalizeStorageKey(key)); }
  deletePrefix(prefix: string) { return this.driver.deletePrefix(normalizeStorageKey(prefix)); }
  exists(key: string) { return this.driver.exists(normalizeStorageKey(key)); }
  metadata(key: string) { return this.driver.metadata(normalizeStorageKey(key)); }
  temporaryUrl(key: string, expiresSeconds: number) { return this.driver.temporaryUrl(normalizeStorageKey(key), expiresSeconds); }
  check() { return this.driver.check(); }
  freeBytes() { return this.driver.freeBytes(); }
  localPath(key: string) { return this.driver.localPath?.(normalizeStorageKey(key)); }
  publicUrl(key: string) { const normalized = normalizeStorageKey(key); return this.driver.name === 'local' ? `/uploads/${normalized}` : `/api/storage/objects/${normalized}`; }
  keyFromUrl(url: string) { const match = /^(?:\/uploads|\/api\/storage\/objects)\/(.+)$/.exec(url); return match ? normalizeStorageKey(match[1]) : null; }
}
