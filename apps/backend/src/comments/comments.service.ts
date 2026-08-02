import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  list(episodeId: string) { return this.prisma.comment.findMany({ where: { episodeId, status: CommentStatus.APPROVED, deletedAt: null }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  adminList() { return this.prisma.comment.findMany({ where: { deletedAt: null }, include: { user: { select: { id: true, name: true, email: true } }, episode: { include: { series: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }); }
  create(dto: CreateCommentDto, userId: string) { const pending = this.config.get<string>('COMMENTS_REQUIRE_APPROVAL') !== 'false'; return this.prisma.comment.create({ data: { episodeId: dto.episodeId, userId, body: dto.body.trim(), approved: !pending, status: pending ? CommentStatus.PENDING : CommentStatus.APPROVED }, include: { user: { select: { name: true } } } }); }
  async report(id: string) { const comment = await this.prisma.comment.findFirst({ where: { id, deletedAt: null } }); if (!comment) throw new NotFoundException('Comentario no encontrado'); const updated = await this.prisma.comment.update({ where: { id }, data: { reportCount: { increment: 1 } } }); return { reported: true, reportCount: updated.reportCount }; }
  async editOwn(id: string, body: string, userId: string) { const comment = await this.prisma.comment.findFirst({ where: { id, userId, deletedAt: null } }); if (!comment) throw new NotFoundException('Comentario no encontrado'); if (Date.now() - comment.createdAt.getTime() > 15 * 60_000) throw new ForbiddenException('El periodo de edicion ha vencido'); return this.prisma.comment.update({ where: { id }, data: { body: body.trim(), status: CommentStatus.PENDING, approved: false } }); }
  update(id: string, dto: UpdateCommentDto) { const status = dto.status ?? (dto.approved === true ? CommentStatus.APPROVED : dto.approved === false ? CommentStatus.REJECTED : undefined); return this.prisma.comment.update({ where: { id }, data: { status, approved: status === CommentStatus.APPROVED, rejectionReason: dto.rejectionReason } }); }
  async removeOwn(id: string, userId: string) { const result = await this.prisma.comment.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } }); if (!result.count) throw new NotFoundException('Comentario no encontrado'); return { removed: true }; }
  remove(id: string) { return this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date(), status: CommentStatus.HIDDEN, approved: false } }); }
}
