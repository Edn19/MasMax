import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckFavoriteDto, CreateFavoriteDto } from './dto';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
      include: {
        episode: { include: { series: true } },
        movie: { include: { genres: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateFavoriteDto) {
    this.validateTarget(dto);
    try {
      return await this.prisma.favorite.create({
        data: { userId, episodeId: dto.episodeId, movieId: dto.movieId },
        include: {
          episode: { include: { series: true } },
          movie: { include: { genres: true } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('Este contenido ya esta en favoritos');
        if (error.code === 'P2003') throw new BadRequestException('El contenido seleccionado no existe');
      }
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    const favorite = await this.prisma.favorite.findFirst({ where: { id, userId } });
    if (!favorite) throw new NotFoundException('Favorito no encontrado');
    return this.prisma.favorite.delete({ where: { id }, select: { id: true } });
  }

  async check(userId: string, dto: CheckFavoriteDto) {
    this.validateTarget(dto);
    const favorite = await this.prisma.favorite.findFirst({
      where: {
        userId,
        episodeId: dto.episodeId,
        movieId: dto.movieId,
      },
      select: { id: true },
    });
    return { favorite: Boolean(favorite), favoriteId: favorite?.id ?? null };
  }

  private validateTarget(dto: CreateFavoriteDto | CheckFavoriteDto) {
    if (Boolean(dto.episodeId) === Boolean(dto.movieId)) {
      throw new BadRequestException('Envia episodeId o movieId, pero no ambos');
    }
  }
}
