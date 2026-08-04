import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, copyFile, mkdir, readFile, rename, rm, stat, statfs, writeFile } from 'fs/promises';
import { dirname, join, relative, resolve } from 'path';
import { normalizeStorageKey, StorageDriver, StorageObjectMetadata, StorageWriteOptions } from './storage.types';

@Injectable()
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;
  constructor(private readonly config: ConfigService) {}

  async putFile(key: string, sourcePath: string) {
    const target = this.localPath(key);
    await mkdir(dirname(target), { recursive: true });
    try { await rename(sourcePath, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(sourcePath, target);
      await rm(sourcePath, { force: true });
    }
  }
  async putBuffer(key: string, content: Buffer) { const target = this.localPath(key); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content, { flag: 'wx' }); }
  async downloadToFile(key: string, destinationPath: string) { await mkdir(dirname(destinationPath), { recursive: true }); await copyFile(this.localPath(key), destinationPath); }
  read(key: string) { return readFile(this.localPath(key)); }
  async delete(key: string) { await rm(this.localPath(key), { force: true }); }
  async deletePrefix(prefix: string) { await rm(this.localPath(prefix), { recursive: true, force: true }); }
  async exists(key: string) { try { await access(this.localPath(key)); return true; } catch { return false; } }
  async metadata(key: string): Promise<StorageObjectMetadata | null> { try { const value = await stat(this.localPath(key)); return { size: value.size, lastModified: value.mtime }; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } }
  async temporaryUrl(key: string, _expiresSeconds: number) { return `/uploads/${normalizeStorageKey(key)}`; }
  async check() { await mkdir(this.root(), { recursive: true }); await access(this.root()); }
  async freeBytes() { const disk = await statfs(this.root()); return BigInt(disk.bavail) * BigInt(disk.bsize); }
  localPath(key: string) { const root = resolve(this.root()); const target = resolve(root, normalizeStorageKey(key)); if (relative(root, target).startsWith('..') || target === root) throw new Error('Clave fuera del almacenamiento local'); return target; }
  private root() { return this.config.get<string>('LOCAL_STORAGE_PATH') ?? this.config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'); }
}
