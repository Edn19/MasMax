import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSeasonDto, UpdateSeasonDto } from './dto';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private seasonNumberConflict(error?: Prisma.PrismaClientKnownRequestError) {
    if (error) this.logger.warn(`season_number_conflict code=${error.code} target=${JSON.stringify(error.meta?.target)}`);
    return new ConflictException('La serie ya tiene una temporada con ese numero.');
  }

  list(seriesId: string) {
    return this.prisma.season.findMany({
      where: { seriesId, deletedAt: null },
      include: { _count: { select: { episodes: { where: { deletedAt: null } } } } },
      orderBy: { number: 'asc' },
    });
  }

  async create(dto: CreateSeasonDto) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const series = await transaction.series.findFirst({ where: { id: dto.seriesId, deletedAt: null }, select: { id: true } });
        if (!series) throw new NotFoundException('Serie no encontrada');
        const aggregate = await transaction.season.aggregate({ where: { seriesId: dto.seriesId }, _max: { number: true } });
        const number = dto.number ?? (aggregate._max.number ?? 0) + 1;
        const duplicate = await transaction.season.findFirst({ where: { seriesId: dto.seriesId, number }, select: { id: true } });
        if (duplicate) throw this.seasonNumberConflict();
        return transaction.season.create({
          data: {
            seriesId: dto.seriesId,
            number,
            title: dto.title?.trim() || `Temporada ${number}`,
            description: dto.description?.trim() || '',
            posterUrl: dto.posterUrl?.trim() || null,
            published: dto.published ?? false,
          },
          include: { _count: { select: { episodes: true } } },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.seasonNumberConflict(error);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSeasonDto) {
    const season = await this.prisma.season.findFirst({ where: { id, deletedAt: null } });
    if (!season) throw new NotFoundException('Temporada no encontrada');
    if (dto.number !== undefined && dto.number !== season.number) {
      const duplicate = await this.prisma.season.findFirst({
        where: { seriesId: season.seriesId, number: dto.number, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw this.seasonNumberConflict();
    }
    try {
      return await this.prisma.season.update({
        where: { id },
        data: {
          number: dto.number,
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          posterUrl: dto.posterUrl?.trim() || undefined,
          published: dto.published,
        },
        include: { _count: { select: { episodes: { where: { deletedAt: null } } } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw this.seasonNumberConflict(error);
      throw error;
    }
  }

  async remove(id: string) {
    const season = await this.prisma.season.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { episodes: { where: { deletedAt: null } } } } } });
    if (!season) throw new NotFoundException('Temporada no encontrada');
    if (season._count.episodes > 0) throw new ConflictException('No se puede eliminar una temporada que contiene episodios');
    await this.prisma.season.update({ where: { id }, data: { deletedAt: new Date(), published: false } });
    return { removed: true };
  }
}
