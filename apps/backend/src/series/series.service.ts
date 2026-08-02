import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SeriesStatus } from '@prisma/client';
import { toSlug } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeriesDto, QuerySeriesDto, UpdateSeriesDto } from './dto';

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: QuerySeriesDto) {
    const where: Prisma.SeriesWhereInput = {
      AND: [
        { deletedAt: null },
        query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
        query.genre ? { genres: { some: { slug: query.genre } } } : {},
        query.status ? { status: query.status as SeriesStatus } : {},
        query.year ? { year: query.year } : {},
      ],
    };

    return this.prisma.series.findMany({
      where,
      include: { genres: true, episodes: { orderBy: { publishedAt: 'desc' }, take: 1 } },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });
  }

  featured() {
    return this.prisma.series.findMany({
      where: { featured: true, deletedAt: null },
      include: { genres: true },
      take: 8,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async bySlug(slug: string, ip?: string) {
    const series = await this.prisma.series.findUnique({
      where: { slug, deletedAt: null },
      include: { genres: true, episodes: { orderBy: { number: 'asc' } } },
    });
    if (!series) throw new NotFoundException('Serie no encontrada');
    await this.prisma.$transaction([
      this.prisma.series.update({ where: { id: series.id }, data: { views: { increment: 1 } } }),
      this.prisma.viewLog.create({ data: { seriesId: series.id, ip } }),
    ]);
    return series;
  }

  create(dto: CreateSeriesDto) {
    return this.prisma.series.create({
      data: {
        title: dto.title,
        slug: dto.slug ? toSlug(dto.slug) : toSlug(dto.title),
        description: dto.description,
        cover: dto.cover,
        banner: dto.banner,
        year: dto.year,
        status: dto.status as SeriesStatus,
        featured: dto.featured ?? false,
        genres: { connect: dto.genreIds.map((id) => ({ id })) },
      },
      include: { genres: true },
    });
  }

  update(id: string, dto: UpdateSeriesDto) {
    const { genreIds, slug, ...rest } = dto;
    return this.prisma.series.update({
      where: { id },
      data: {
        ...rest,
        slug: slug ? toSlug(slug) : undefined,
        genres: genreIds ? { set: genreIds.map((genreId) => ({ id: genreId })) } : undefined,
      },
      include: { genres: true },
    });
  }

  remove(id: string) {
    return this.prisma.series.update({ where: { id }, data: { deletedAt: new Date(), featured: false } });
  }
}
