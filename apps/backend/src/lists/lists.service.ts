import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCatalogResponse } from '../common/catalog-response';
import { PrismaService } from '../prisma/prisma.service';
import { AddListItemDto, CreateListDto, UpdateListDto } from './dto';

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.contentList.findMany({
      where: { userId },
      include: { items: { include: { episode: { include: { series: true } }, movie: true }, orderBy: { position: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    }).then(toCatalogResponse);
  }

  async create(userId: string, dto: CreateListDto) {
    if (dto.profileId && !await this.prisma.profile.findFirst({ where: { id: dto.profileId, userId } })) throw new NotFoundException('Perfil no encontrado');
    return this.prisma.contentList.create({ data: { userId, profileId: dto.profileId, name: dto.name.trim(), isPrivate: dto.isPrivate ?? true } });
  }

  async update(userId: string, id: string, dto: UpdateListDto) {
    await this.owned(userId, id);
    return this.prisma.contentList.update({ where: { id }, data: { name: dto.name?.trim(), isPrivate: dto.isPrivate } });
  }

  async add(userId: string, listId: string, dto: AddListItemDto) {
    if (Boolean(dto.episodeId) === Boolean(dto.movieId)) throw new BadRequestException('Envia episodeId o movieId');
    await this.owned(userId, listId);
    try {
      return await this.prisma.contentListItem.create({ data: { listId, episodeId: dto.episodeId, movieId: dto.movieId, position: dto.position ?? 0 } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('El contenido ya existe en la lista');
      throw error;
    }
  }

  async removeItem(userId: string, listId: string, itemId: string) {
    await this.owned(userId, listId);
    await this.prisma.contentListItem.deleteMany({ where: { id: itemId, listId } });
    return { removed: true };
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.contentList.delete({ where: { id } });
    return { removed: true };
  }

  private async owned(userId: string, id: string) {
    const list = await this.prisma.contentList.findFirst({ where: { id, userId } });
    if (!list) throw new NotFoundException('Lista no encontrada');
    return list;
  }
}
