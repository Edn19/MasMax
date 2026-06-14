import { Injectable } from '@nestjs/common';
import { toSlug } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { GenreDto } from './dto';

@Injectable()
export class GenresService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.genre.findMany({ orderBy: { name: 'asc' } });
  }

  create(dto: GenreDto) {
    return this.prisma.genre.create({ data: { name: dto.name, slug: dto.slug ? toSlug(dto.slug) : toSlug(dto.name) } });
  }

  update(id: string, dto: GenreDto) {
    return this.prisma.genre.update({
      where: { id },
      data: { name: dto.name, slug: dto.slug ? toSlug(dto.slug) : toSlug(dto.name) },
    });
  }

  remove(id: string) {
    return this.prisma.genre.delete({ where: { id } });
  }
}
