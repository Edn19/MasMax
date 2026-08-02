import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const [series, episodes, movies, users, activeUsers, activeSessions, viewLogs, pendingComments, processingFiles, recentActivity] = await Promise.all([
      this.prisma.series.count({ where: { deletedAt: null } }),
      this.prisma.episode.count({ where: { deletedAt: null } }),
      this.prisma.movie.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { active: true, deletedAt: null } }),
      this.prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.viewLog.count(),
      this.prisma.comment.count({ where: { status: 'PENDING', deletedAt: null } }),
      this.prisma.mediaFile.count({ where: { status: { in: ['VALIDATING', 'QUEUED', 'PROCESSING'] } } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { actor: { select: { name: true, email: true } } } }),
    ]);
    return { series, episodes, movies, users, activeUsers, activeSessions, totalViews: viewLogs, pendingComments, processingFiles, recentActivity };
  }
}
