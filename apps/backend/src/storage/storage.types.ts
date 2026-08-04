export type StorageDriverName = 'local' | 's3';

export type StorageObjectMetadata = {
  size: number;
  contentType?: string;
  lastModified?: Date;
};

export type StorageWriteOptions = {
  contentType?: string;
};

export interface StorageDriver {
  readonly name: StorageDriverName;
  putFile(key: string, sourcePath: string, options?: StorageWriteOptions): Promise<void>;
  putBuffer(key: string, content: Buffer, options?: StorageWriteOptions): Promise<void>;
  downloadToFile(key: string, destinationPath: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  metadata(key: string): Promise<StorageObjectMetadata | null>;
  temporaryUrl(key: string, expiresSeconds: number): Promise<string>;
  check(): Promise<void>;
  freeBytes(): Promise<bigint | null>;
  localPath?(key: string): string;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export function normalizeStorageKey(value: string) {
  const key = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!key || key.length > 512 || key.includes('\0') || key.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Clave de almacenamiento no valida');
  }
  return key;
}
