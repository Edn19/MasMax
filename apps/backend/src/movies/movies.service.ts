import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaStatus, MovieStatus, Prisma, VideoSource } from '@prisma/client';
import { NormalizedVideo, normalizeVideo } from '../common/video';
import { validatePlaybackMarkers } from '../common/playback-markers';
import { toSlug } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovieDto, UpdateMovieDto } from './dto';
import { toCatalogResponse } from '../common/catalog-response';
import { publishedMovieWhere } from '../common/content-visibility';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished() {
    return this.prisma.movie.findMany({
      where: publishedMovieWhere(),
      include: { genres: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
    }).then(toCatalogResponse);
  }

  listAdmin() {
    return this.prisma.movie.findMany({
      where: { deletedAt: null },
      include: { genres: true, subtitles: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async bySlug(slug: string) {
    const movie = await this.prisma.movie.findFirst({
      where: publishedMovieWhere({ slug }),
      include: { genres: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] } },
    });
    if (!movie) throw new NotFoundException('Pelicula no encontrada');
    await this.prisma.movie.update({ where: { id: movie.id }, data: { views: { increment: 1 } } });
    return toCatalogResponse(movie);
  }

  recommendations(id: string) {
    return this.prisma.movie.findMany({
      where: publishedMovieWhere({ id: { not: id } }),
      include: { genres: true },
      orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
      take: 12,
    }).then(toCatalogResponse);
  }

  async create(dto: CreateMovieDto) {
    const video = normalizeVideo(dto);
    await this.assertLocalReady(video);
    validatePlaybackMarkers(dto, dto.duration * 60);
    try {
      return await this.prisma.movie.create({
        data: {
          title: dto.title.trim(),
          slug: toSlug(dto.slug?.trim() || dto.title),
          description: dto.description.trim(),
          posterUrl: dto.posterUrl.trim(),
          bannerUrl: dto.bannerUrl.trim(),
          ...video,
          duration: dto.duration,
          introStartSec: dto.introStartSec,
          introEndSec: dto.introEndSec,
          recapStartSec: dto.recapStartSec,
          recapEndSec: dto.recapEndSec,
          releaseYear: dto.releaseYear,
          status: dto.status as MovieStatus,
          genres: { connect: dto.genreIds.map((id) => ({ id })) },
        },
        include: { genres: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateMovieDto) {
    const current = await this.prisma.movie.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Pelicula no encontrada');
    const video = normalizeVideo({
      videoUrl: dto.videoUrl ?? current.videoUrl,
      videoSource: dto.videoSource ?? current.videoSource,
      videoType: dto.videoType ?? current.videoType,
      originalVideoUrl: dto.originalVideoUrl ?? current.originalVideoUrl,
      processedVideoUrl: dto.processedVideoUrl ?? current.processedVideoUrl,
    });
    await this.assertLocalReady(video);
    const markers = { introStartSec: dto.introStartSec !== undefined ? dto.introStartSec : current.introStartSec, introEndSec: dto.introEndSec !== undefined ? dto.introEndSec : current.introEndSec, recapStartSec: dto.recapStartSec !== undefined ? dto.recapStartSec : current.recapStartSec, recapEndSec: dto.recapEndSec !== undefined ? dto.recapEndSec : current.recapEndSec };
    validatePlaybackMarkers(markers, (dto.duration ?? current.duration) * 60);

    try {
      return await this.prisma.movie.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          slug: dto.slug ? toSlug(dto.slug) : undefined,
          description: dto.description?.trim(),
          posterUrl: dto.posterUrl?.trim(),
          bannerUrl: dto.bannerUrl?.trim(),
          ...video,
          duration: dto.duration,
          introStartSec: dto.introStartSec,
          introEndSec: dto.introEndSec,
          recapStartSec: dto.recapStartSec,
          recapEndSec: dto.recapEndSec,
          releaseYear: dto.releaseYear,
          status: dto.status as MovieStatus | undefined,
          genres: dto.genreIds ? { set: dto.genreIds.map((genreId) => ({ id: genreId })) } : undefined,
        },
        include: { genres: true },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.movie.update({ where: { id }, data: { deletedAt: new Date(), status: MovieStatus.HIDDEN }, select: { id: true } });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('Ya existe una pelicula con ese slug');
      if (error.code === 'P2003') throw new BadRequestException('Uno o mas generos no existen');
      if (error.code === 'P2025') throw new NotFoundException('Pelicula no encontrada');
    }
    throw error;
  }

  private async assertLocalReady(video: NormalizedVideo) {
    if (video.videoSource !== VideoSource.LOCAL) return;
    const match = /^\/(?:uploads|api\/storage\/objects)\/(.+)$/.exec(video.videoUrl);
    const media = match ? await this.prisma.mediaFile.findUnique({ where: { relativePath: match[1] }, select: { status: true } }) : null;
    if (!media || media.status !== MediaStatus.READY) throw new ConflictException('El video local aun no termino de procesarse');
  }
}
