import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MovieStatus, Prisma } from '@prisma/client';
import { normalizeVideo } from '../common/video';
import { toSlug } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMovieDto, UpdateMovieDto } from './dto';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished() {
    return this.prisma.movie.findMany({
      where: { status: MovieStatus.PUBLISHED, deletedAt: null },
      include: { genres: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAdmin() {
    return this.prisma.movie.findMany({
      include: { genres: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async bySlug(slug: string) {
    const movie = await this.prisma.movie.findFirst({
      where: { slug, status: MovieStatus.PUBLISHED, deletedAt: null },
      include: { genres: true },
    });
    if (!movie) throw new NotFoundException('Pelicula no encontrada');
    await this.prisma.movie.update({ where: { id: movie.id }, data: { views: { increment: 1 } } });
    return movie;
  }

  recommendations(id: string) {
    return this.prisma.movie.findMany({
      where: { id: { not: id }, status: MovieStatus.PUBLISHED, deletedAt: null },
      include: { genres: true },
      orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
      take: 12,
    });
  }

  async create(dto: CreateMovieDto) {
    const video = normalizeVideo(dto);
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
}
