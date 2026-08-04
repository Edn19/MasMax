import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaStatus, MediaType, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { readFile, rm } from 'fs/promises';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { CreateSubtitleDto, QuerySubtitlesDto, UpdateSubtitleDto } from './dto';
import { parseSubtitleFile } from './subtitle-file';

@Injectable()
export class SubtitlesService {
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService) {}

  async list(query: QuerySubtitlesDto) {
    this.assertSingleTarget(query.episodeId, query.movieId);
    return this.prisma.subtitleTrack.findMany({
      where: { episodeId: query.episodeId, movieId: query.movieId },
      include: { episode: { select: { id: true, title: true, number: true } }, movie: { select: { id: true, title: true } } },
      orderBy: [{ isDefault: 'desc' }, { language: 'asc' }, { label: 'asc' }],
    });
  }

  async create(file: Express.Multer.File, dto: CreateSubtitleDto) {
    this.assertSingleTarget(dto.episodeId, dto.movieId);
    if (dto.isDefault && dto.isActive === false) throw new BadRequestException('La pista predeterminada debe estar activa');
    await this.assertTargetExists(dto.episodeId, dto.movieId);
    const extension = extname(file.originalname).toLowerCase();
    let parsed;
    try { parsed = parseSubtitleFile(await readFile(file.path), extension); }
    catch (error) { await rm(file.path, { force: true }); throw error; }

    const storageName = `${randomUUID()}.vtt`;
    const relativePath = `subtitles/${storageName}`;
    try { await this.storage.putBuffer(relativePath, Buffer.from(parsed.content, 'utf8'), { contentType: 'text/vtt; charset=utf-8' }); }
    finally { await rm(file.path, { force: true }); }
    const contentSize = Buffer.byteLength(parsed.content);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (dto.isDefault) await this.clearDefault(transaction, dto.episodeId, dto.movieId);
        await transaction.mediaFile.create({ data: { originalName: file.originalname, storageName, relativePath, mimeType: 'text/vtt', extension: '.vtt', sizeBytes: BigInt(contentSize), checksum: createHash('sha256').update(parsed.content).digest('hex'), mediaType: MediaType.SUBTITLE, status: MediaStatus.READY } });
        return transaction.subtitleTrack.create({ data: { episodeId: dto.episodeId, movieId: dto.movieId, language: dto.language.toLowerCase(), label: dto.label.trim(), url: this.storage.publicUrl(relativePath), originalName: file.originalname, sourceFormat: parsed.sourceFormat, isDefault: dto.isDefault ?? false, isForced: dto.isForced ?? false, isActive: dto.isActive ?? true } });
      });
    } catch (error) {
      await this.storage.delete(relativePath).catch(() => undefined);
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateSubtitleDto) {
    const current = await this.prisma.subtitleTrack.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pista de subtitulos no encontrada');
    const isActive = dto.isActive ?? current.isActive;
    const isDefault = dto.isDefault ?? current.isDefault;
    if (isDefault && !isActive) throw new BadRequestException('La pista predeterminada debe estar activa');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        if (dto.isDefault) await this.clearDefault(transaction, current.episodeId ?? undefined, current.movieId ?? undefined);
        return transaction.subtitleTrack.update({ where: { id }, data: { language: dto.language?.toLowerCase(), label: dto.label?.trim(), isDefault: dto.isActive === false ? false : dto.isDefault, isForced: dto.isForced, isActive: dto.isActive } });
      });
    } catch (error) { this.handlePrismaError(error); }
  }

  async content(id: string, includeInactive = false) {
    const track = await this.prisma.subtitleTrack.findFirst({ where: { id, ...(includeInactive ? {} : { isActive: true }) } });
    if (!track) throw new NotFoundException('Pista de subtitulos no encontrada');
    const key = this.subtitleKey(track.url);
    return this.storage.read(key).then((content) => content.toString('utf8')).catch(() => { throw new NotFoundException('El archivo de subtitulos no esta disponible'); });
  }

  async remove(id: string) {
    const track = await this.prisma.subtitleTrack.findUnique({ where: { id } });
    if (!track) throw new NotFoundException('Pista de subtitulos no encontrada');
    let key: string | null = null;
    try { key = this.subtitleKey(track.url); } catch { key = null; }
    const backup = key ? await this.storage.read(key).catch(() => null) : null;
    if (key) await this.storage.delete(key);
    try {
      await this.prisma.$transaction([
        this.prisma.subtitleTrack.delete({ where: { id } }),
        this.prisma.mediaFile.deleteMany({ where: { relativePath: key ?? undefined } }),
      ]);
      return { removed: true };
    } catch (error) {
      if (key && backup) await this.storage.putBuffer(key, backup, { contentType: 'text/vtt; charset=utf-8' }).catch(() => undefined);
      this.handlePrismaError(error);
    }
  }

  private assertSingleTarget(episodeId?: string, movieId?: string) { if (Boolean(episodeId) === Boolean(movieId)) throw new BadRequestException('Indica exactamente un episodeId o movieId'); }
  private async assertTargetExists(episodeId?: string, movieId?: string) { const exists = episodeId ? await this.prisma.episode.count({ where: { id: episodeId, deletedAt: null } }) : await this.prisma.movie.count({ where: { id: movieId, deletedAt: null } }); if (!exists) throw new NotFoundException(episodeId ? 'Episodio no encontrado' : 'Pelicula no encontrada'); }
  private clearDefault(transaction: Prisma.TransactionClient, episodeId?: string, movieId?: string) { return transaction.subtitleTrack.updateMany({ where: { episodeId, movieId, isDefault: true }, data: { isDefault: false } }); }
  private subtitleKey(url: string) { const key = this.storage.keyFromUrl(url); if (!key || !/^subtitles\/[a-z0-9][a-z0-9._-]{0,180}\.vtt$/i.test(key)) throw new BadRequestException('La pista usa una ruta heredada no administrada'); return key; }
  private handlePrismaError(error: unknown): never { if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ConflictException) throw error; if (error instanceof Prisma.PrismaClientKnownRequestError) { if (error.code === 'P2002') throw new ConflictException('Ya existe una pista predeterminada para este contenido'); if (error.code === 'P2003') throw new BadRequestException('El episodio o pelicula no existe'); if (error.code === 'P2025') throw new NotFoundException('Pista de subtitulos no encontrada'); } throw error; }
}
