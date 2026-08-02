import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProgressDto } from './dto';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, profileId: string | undefined, limit: number, continueOnly = false) {
    const threshold = Number(process.env.CONTINUE_WATCHING_MAX_PERCENT ?? 95);
    return this.prisma.watchHistory.findMany({
      where: { userId, profileId, ...(continueOnly ? { percentage: { gt: 0, lt: threshold }, completedAt: null } : {}) },
      include: { episode: { include: { series: true } }, movie: { include: { genres: true } } },
      orderBy: { lastPlayedAt: 'desc' }, take: Math.min(limit, 100),
    });
  }

  async update(userId: string, dto: UpdateProgressDto, sessionId: string) {
    if (Boolean(dto.episodeId) === Boolean(dto.movieId)) throw new BadRequestException('Envia episodeId o movieId, pero no ambos');
    if (dto.profileId) {
      const profile = await this.prisma.profile.findFirst({ where: { id: dto.profileId, userId } });
      if (!profile) throw new NotFoundException('Perfil no encontrado');
    }
    const duration = Math.max(dto.durationSec, 0);
    const position = Math.min(Math.max(dto.positionSec, 0), duration || dto.positionSec);
    const percentage = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;
    const completed = dto.completed || percentage >= 95;
    const existing = await this.prisma.watchHistory.findFirst({ where: { userId, profileId: dto.profileId ?? null, episodeId: dto.episodeId ?? null, movieId: dto.movieId ?? null } });
    const data = { positionSec: position, durationSec: duration, percentage, lastPlayedAt: new Date(), completedAt: completed ? new Date() : null };
    const history = existing
      ? await this.prisma.watchHistory.update({ where: { id: existing.id }, data })
      : await this.prisma.watchHistory.create({ data: { userId, profileId: dto.profileId, episodeId: dto.episodeId, movieId: dto.movieId, ...data } });
    await this.prisma.viewLog.create({ data: { userId, sessionId, profileId: dto.profileId, episodeId: dto.episodeId, movieId: dto.movieId, positionSec: position, durationSec: duration, completed } });
    return history;
  }

  async remove(userId: string, id: string) {
    const item = await this.prisma.watchHistory.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Elemento de historial no encontrado');
    await this.prisma.watchHistory.delete({ where: { id } });
    return { removed: true };
  }

  async clear(userId: string) { const result = await this.prisma.watchHistory.deleteMany({ where: { userId } }); return { removed: result.count }; }
}
