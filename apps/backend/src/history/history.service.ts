import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressQueryDto, UpdateProgressDto } from './dto';
import { toCatalogResponse } from '../common/catalog-response';

export function progressValues(positionSec: number, durationSec: number, threshold: number, existingCompletedAt?: Date | null, explicitlyCompleted = false) {
  const duration = Math.max(durationSec, 0);
  const position = Math.min(Math.max(positionSec, 0), duration || positionSec);
  const percentage = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;
  const completed = Boolean(existingCompletedAt) || explicitlyCompleted || percentage >= threshold;
  return { position, duration, percentage, completed, completedAt: existingCompletedAt ?? (completed ? new Date() : null) };
}

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, profileId: string | undefined, limit: number, continueOnly = false) {
    const threshold = Number(process.env.CONTINUE_WATCHING_MAX_PERCENT ?? 95);
    return this.prisma.watchHistory.findMany({
      where: { userId, profileId, ...(continueOnly ? { percentage: { gt: 0, lt: threshold }, completedAt: null } : {}) },
      include: { episode: { include: { series: true } }, movie: { include: { genres: true } } },
      orderBy: { lastPlayedAt: 'desc' }, take: Math.min(limit, 100),
    }).then(toCatalogResponse);
  }

  async getProgress(userId: string, query: ProgressQueryDto) {
    if (Boolean(query.episodeId) === Boolean(query.movieId)) throw new BadRequestException('Envia episodeId o movieId, pero no ambos');
    if (query.profileId && !await this.prisma.profile.count({ where: { id: query.profileId, userId } })) throw new NotFoundException('Perfil no encontrado');
    return this.prisma.watchHistory.findFirst({ where: { userId, profileId: query.profileId ?? null, episodeId: query.episodeId ?? null, movieId: query.movieId ?? null } });
  }

  async update(userId: string, dto: UpdateProgressDto, sessionId: string) {
    if (Boolean(dto.episodeId) === Boolean(dto.movieId)) throw new BadRequestException('Envia episodeId o movieId, pero no ambos');
    if (dto.profileId) {
      const profile = await this.prisma.profile.findFirst({ where: { id: dto.profileId, userId } });
      if (!profile) throw new NotFoundException('Perfil no encontrado');
    }
    const existing = await this.prisma.watchHistory.findFirst({ where: { userId, profileId: dto.profileId ?? null, episodeId: dto.episodeId ?? null, movieId: dto.movieId ?? null } });
    const threshold = Math.min(Math.max(Number(process.env.PLAYBACK_COMPLETION_PERCENT ?? 90), 50), 100);
    const values = progressValues(dto.positionSec, dto.durationSec, threshold, existing?.completedAt, dto.completed ?? false);
    const data = { positionSec: values.position, durationSec: values.duration, percentage: values.percentage, lastPlayedAt: new Date(), completedAt: values.completedAt };
    const history = existing
      ? await this.prisma.watchHistory.update({ where: { id: existing.id }, data })
      : await this.prisma.watchHistory.create({ data: { userId, profileId: dto.profileId, episodeId: dto.episodeId, movieId: dto.movieId, ...data } });
    await this.prisma.viewLog.create({ data: { userId, sessionId, profileId: dto.profileId, episodeId: dto.episodeId, movieId: dto.movieId, positionSec: values.position, durationSec: values.duration, completed: values.completed } });
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
