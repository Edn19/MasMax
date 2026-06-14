import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(episodeId: string) {
    return this.prisma.comment.findMany({
      where: { episodeId, approved: true },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  adminList() {
    return this.prisma.comment.findMany({
      include: { user: { select: { id: true, name: true, email: true } }, episode: { include: { series: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateCommentDto, userId: string) {
    return this.prisma.comment.create({ data: { ...dto, userId }, include: { user: { select: { name: true } } } });
  }

  update(id: string, dto: UpdateCommentDto) {
    return this.prisma.comment.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.comment.delete({ where: { id } });
  }
}
