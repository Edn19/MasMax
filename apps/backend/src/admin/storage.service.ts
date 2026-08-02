import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType } from '@prisma/client';
import { rm, statfs } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StorageService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  async stats() {
    const [aggregate, videos, images, processing, failed, all, disk] = await Promise.all([
      this.prisma.mediaFile.aggregate({ _sum: { sizeBytes: true }, _count: true }),
      this.prisma.mediaFile.count({ where: { mediaType: MediaType.VIDEO } }),
      this.prisma.mediaFile.count({ where: { mediaType: MediaType.IMAGE } }),
      this.prisma.mediaFile.count({ where: { status: { in: [MediaStatus.VALIDATING, MediaStatus.QUEUED, MediaStatus.PROCESSING] } } }),
      this.prisma.mediaFile.count({ where: { status: MediaStatus.FAILED } }),
      this.prisma.mediaFile.findMany({ select: { id: true, relativePath: true, createdAt: true, sizeBytes: true } }),
      statfs(this.root()),
    ]);
    const references = await this.references();
    const orphaned = all.filter((file) => !references.has(`/uploads/${file.relativePath}`));
    return { totalBytes: (aggregate._sum.sizeBytes ?? 0n).toString(), totalFiles: aggregate._count, videos, images, processing, failed, orphaned: orphaned.length, orphanedBytes: orphaned.reduce((sum, file) => sum + file.sizeBytes, 0n).toString(), freeBytes: (BigInt(disk.bavail) * BigInt(disk.bsize)).toString() };
  }
  async cleanup() {
    const cutoff = new Date(Date.now() - Number(this.config.get<string>('ORPHAN_RETENTION_DAYS') ?? 7) * 86_400_000);
    const references = await this.references();
    const files = await this.prisma.mediaFile.findMany({ where: { createdAt: { lt: cutoff } } });
    const orphaned = files.filter((file) => !references.has(`/uploads/${file.relativePath}`));
    for (const file of orphaned) {
      await rm(join(this.root(), file.relativePath), { force: true });
      await this.prisma.mediaFile.delete({ where: { id: file.id } });
    }
    return { removed: orphaned.length };
  }
  async remove(id: string) {
    const file = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Archivo multimedia no encontrado');
    const references = await this.references();
    if (references.has(`/uploads/${file.relativePath}`)) throw new ConflictException('El archivo sigue referenciado por contenido o configuracion');
    await rm(join(this.root(), file.relativePath), { force: true });
    await this.prisma.mediaFile.delete({ where: { id } });
    return { removed: true };
  }
  private root() { return this.config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'); }
  private async references() { const [episodes,movies,settings] = await Promise.all([this.prisma.episode.findMany({select:{videoUrl:true,thumbnailUrl:true}}),this.prisma.movie.findMany({select:{videoUrl:true,posterUrl:true,bannerUrl:true}}),this.prisma.siteSetting.findMany({select:{logo:true,favicon:true,heroImage:true}})]); return new Set([...episodes.flatMap((x)=>[x.videoUrl,x.thumbnailUrl]),...movies.flatMap((x)=>[x.videoUrl,x.posterUrl,x.bannerUrl]),...settings.flatMap((x)=>[x.logo,x.favicon,x.heroImage])].filter((x):x is string=>Boolean(x))); }
}
