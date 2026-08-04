import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStatus, MediaType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';

@Injectable()
export class StorageService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly objects: ObjectStorageService) {}
  async stats() {
    const [aggregate, byType, processing, failed, all, disk] = await Promise.all([
      this.prisma.mediaFile.aggregate({ where: { status: { not: MediaStatus.DELETED } }, _sum: { sizeBytes: true }, _count: true }),
      this.prisma.mediaFile.groupBy({ by: ['mediaType'], where: { status: { not: MediaStatus.DELETED } }, _sum: { sizeBytes: true }, _count: true }),
      this.prisma.mediaFile.count({ where: { status: { in: [MediaStatus.VALIDATING, MediaStatus.QUEUED, MediaStatus.PROCESSING] } } }),
      this.prisma.mediaFile.count({ where: { status: MediaStatus.FAILED } }),
      this.prisma.mediaFile.findMany({ where: { status: { not: MediaStatus.DELETED } }, select: { id: true, relativePath: true, createdAt: true, sizeBytes: true } }),
      this.objects.freeBytes(),
    ]);
    const references = await this.references();
    const orphaned = all.filter((file) => !references.has(file.relativePath));
    const videoGroup = byType.find((group) => group.mediaType === MediaType.VIDEO);
    const imageGroup = byType.find((group) => group.mediaType === MediaType.IMAGE);
    return {
      totalBytes: (aggregate._sum.sizeBytes ?? 0n).toString(),
      totalFiles: aggregate._count,
      videos: videoGroup?._count ?? 0,
      videoBytes: (videoGroup?._sum.sizeBytes ?? 0n).toString(),
      images: imageGroup?._count ?? 0,
      imageBytes: (imageGroup?._sum.sizeBytes ?? 0n).toString(),
      processing,
      failed,
      orphaned: orphaned.length,
      orphanedBytes: orphaned.reduce((sum, file) => sum + file.sizeBytes, 0n).toString(),
      freeBytes: disk?.toString() ?? null,
      driver: this.objects.driverName,
    };
  }
  async cleanup() {
    const cutoff = new Date(Date.now() - Number(this.config.get<string>('ORPHAN_RETENTION_DAYS') ?? 7) * 86_400_000);
    const references = await this.references();
    const files = await this.prisma.mediaFile.findMany({ where: { createdAt: { lt: cutoff } } });
    const orphaned = files.filter((file) => !references.has(file.relativePath));
    for (const file of orphaned) {
      await this.deleteObject(file.relativePath);
      await this.prisma.mediaFile.delete({ where: { id: file.id } });
    }
    return { removed: orphaned.length };
  }
  async remove(id: string) {
    const file = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Archivo multimedia no encontrado');
    const references = await this.references();
    if (references.has(file.relativePath)) throw new ConflictException('El archivo sigue referenciado por contenido o configuracion');
    await this.deleteObject(file.relativePath);
    await this.prisma.mediaFile.delete({ where: { id } });
    return { removed: true };
  }
  private async references() { const [episodes,movies,settings,subtitles] = await Promise.all([this.prisma.episode.findMany({select:{videoUrl:true,thumbnailUrl:true}}),this.prisma.movie.findMany({select:{videoUrl:true,posterUrl:true,bannerUrl:true}}),this.prisma.siteSetting.findMany({select:{logo:true,favicon:true,heroImage:true}}),this.prisma.subtitleTrack.findMany({select:{url:true}})]); const urls = [...episodes.flatMap((x)=>[x.videoUrl,x.thumbnailUrl]),...movies.flatMap((x)=>[x.videoUrl,x.posterUrl,x.bannerUrl]),...settings.flatMap((x)=>[x.logo,x.favicon,x.heroImage]),...subtitles.map((x)=>x.url)].filter((x):x is string=>Boolean(x)); return new Set(urls.map((url) => this.objects.keyFromUrl(url)).filter((key): key is string => Boolean(key))); }
  private deleteObject(relativePath: string) { const match = /^hls\/([a-z0-9]+)\/master\.m3u8$/i.exec(relativePath); return match ? this.objects.deletePrefix(`hls/${match[1]}`) : this.objects.delete(relativePath); }
}
