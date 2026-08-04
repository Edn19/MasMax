import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'fs';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { normalizeStorageKey, StorageDriver, StorageObjectMetadata, StorageWriteOptions } from './storage.types';

@Injectable()
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: config.getOrThrow<string>('S3_REGION'),
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: String(config.get<string>('S3_FORCE_PATH_STYLE') ?? 'false').toLowerCase() === 'true',
      credentials: { accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'), secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY') },
    });
  }
  async putFile(key: string, sourcePath: string, options?: StorageWriteOptions) { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: normalizeStorageKey(key), Body: createReadStream(sourcePath), ContentType: options?.contentType })); await import('fs/promises').then(({ rm }) => rm(sourcePath, { force: true })); }
  async putBuffer(key: string, content: Buffer, options?: StorageWriteOptions) { await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: normalizeStorageKey(key), Body: content, ContentType: options?.contentType })); }
  async downloadToFile(key: string, destinationPath: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalizeStorageKey(key) }));
    if (!result.Body) throw new Error('El objeto no tiene contenido');
    await mkdir(dirname(destinationPath), { recursive: true });
    await pipeline(Readable.fromWeb(result.Body.transformToWebStream() as never), createWriteStream(destinationPath, { flags: 'wx' }));
  }
  async read(key: string) { const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: normalizeStorageKey(key) })); if (!result.Body) throw new Error('El objeto no tiene contenido'); return Buffer.from(await result.Body.transformToByteArray()); }
  async delete(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: normalizeStorageKey(key) })); }
  async deletePrefix(prefix: string) {
    const normalized = `${normalizeStorageKey(prefix).replace(/\/+$/, '')}/`;
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: normalized, ContinuationToken: continuationToken }));
      const objects = (listed.Contents ?? []).flatMap((object) => object.Key ? [{ Key: object.Key }] : []);
      if (objects.length) await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects, Quiet: true } }));
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }
  async exists(key: string) { return (await this.metadata(key)) !== null; }
  async metadata(key: string): Promise<StorageObjectMetadata | null> { try { const value = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: normalizeStorageKey(key) })); return { size: value.ContentLength ?? 0, contentType: value.ContentType, lastModified: value.LastModified }; } catch (error) { const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode; if (status === 404) return null; throw error; } }
  temporaryUrl(key: string, expiresSeconds: number) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: normalizeStorageKey(key) }), { expiresIn: expiresSeconds }); }
  async check() { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })); }
  async freeBytes() { return null; }
}
