import { Injectable } from '@nestjs/common';
import { MediaStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

type DailyViewRow = { day: Date | string; views: bigint | number };
type RankedContent = { id: string; type: 'series' | 'episode' | 'movie'; title: string; subtitle?: string; views: number };
type RecentContent = { id: string; type: 'series' | 'episode' | 'movie'; title: string; createdAt: Date };

const DAY_MS = 86_400_000;
const DASHBOARD_DAYS = 14;

export function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function buildDailyViewSeries(rows: DailyViewRow[], start: Date, days = DASHBOARD_DAYS) {
  const values = new Map(rows.map((row) => [startOfUtcDay(new Date(row.day)).toISOString().slice(0, 10), Number(row.views)]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    return { date, views: values.get(date) ?? 0 };
  });
}

export function rankContent(items: RankedContent[], limit = 8) {
  return [...items].sort((left, right) => right.views - left.views || left.title.localeCompare(right.title)).slice(0, limit);
}

export function newestContent(items: RecentContent[], limit = 8) {
  return [...items].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, limit);
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  async stats() {
    const now = new Date();
    const recentUserCutoff = new Date(now.getTime() - 30 * DAY_MS);
    const dailyStart = new Date(startOfUtcDay(now).getTime() - (DASHBOARD_DAYS - 1) * DAY_MS);

    const [
      series,
      seasons,
      episodes,
      movies,
      users,
      activeUsers,
      recentUserSessions,
      activeSessions,
      totalViews,
      pendingComments,
      processingFiles,
      failedFiles,
      recentActivity,
      topSeries,
      topEpisodes,
      topMovies,
      recentSeries,
      recentEpisodes,
      recentMovies,
      seriesWithoutCover,
      moviesWithoutPoster,
      episodesWithoutVideo,
      recentErrors,
      dailyRows,
      storage,
    ] = await Promise.all([
      this.prisma.series.count({ where: { deletedAt: null } }),
      this.prisma.season.count({ where: { deletedAt: null } }),
      this.prisma.episode.count({ where: { deletedAt: null } }),
      this.prisma.movie.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { active: true, deletedAt: null } }),
      this.prisma.session.findMany({
        where: { lastUsedAt: { gte: recentUserCutoff }, user: { active: true, deletedAt: null } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.viewLog.count(),
      this.prisma.comment.count({ where: { status: 'PENDING', deletedAt: null } }),
      this.prisma.mediaFile.count({ where: { status: { in: [MediaStatus.VALIDATING, MediaStatus.QUEUED, MediaStatus.PROCESSING] } } }),
      this.prisma.mediaFile.count({ where: { status: MediaStatus.FAILED } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { actor: { select: { name: true, email: true } } } }),
      this.prisma.series.findMany({ where: { deletedAt: null }, orderBy: { views: 'desc' }, take: 5, select: { id: true, title: true, views: true } }),
      this.prisma.episode.findMany({ where: { deletedAt: null }, orderBy: { views: 'desc' }, take: 5, select: { id: true, title: true, number: true, views: true, series: { select: { title: true } } } }),
      this.prisma.movie.findMany({ where: { deletedAt: null }, orderBy: { views: 'desc' }, take: 5, select: { id: true, title: true, views: true } }),
      this.prisma.series.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, createdAt: true } }),
      this.prisma.episode.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, createdAt: true } }),
      this.prisma.movie.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, createdAt: true } }),
      this.prisma.series.count({ where: { deletedAt: null, cover: '' } }),
      this.prisma.movie.count({ where: { deletedAt: null, posterUrl: '' } }),
      this.prisma.episode.count({ where: { deletedAt: null, videoUrl: '' } }),
      this.prisma.mediaFile.findMany({ where: { status: MediaStatus.FAILED }, orderBy: { updatedAt: 'desc' }, take: 5, select: { id: true, originalName: true, errorMessage: true, updatedAt: true } }),
      this.prisma.$queryRaw<DailyViewRow[]>(Prisma.sql`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS views
        FROM "ViewLog"
        WHERE "createdAt" >= ${dailyStart}
        GROUP BY 1
        ORDER BY 1
      `),
      this.storage.stats(),
    ]);

    const mostViewed = rankContent([
      ...topSeries.map((item) => ({ ...item, type: 'series' as const })),
      ...topEpisodes.map((item) => ({ id: item.id, type: 'episode' as const, title: item.title, subtitle: `${item.series.title} · E${item.number}`, views: item.views })),
      ...topMovies.map((item) => ({ ...item, type: 'movie' as const })),
    ]);
    const recentlyAdded = newestContent([
      ...recentSeries.map((item) => ({ ...item, type: 'series' as const })),
      ...recentEpisodes.map((item) => ({ ...item, type: 'episode' as const })),
      ...recentMovies.map((item) => ({ ...item, type: 'movie' as const })),
    ]);
    const [completedJobs, unassignedJobs, publishedEpisodes, draftEpisodes, publishedMovies, draftMovies] = await Promise.all([
      this.prisma.videoProcessingJob.count({ where: { status: 'COMPLETED' } }),
      this.prisma.videoProcessingJob.count({ where: { targetId: null } }),
      this.prisma.episode.count({ where: { published: true, deletedAt: null } }),
      this.prisma.episode.count({ where: { published: false, deletedAt: null } }),
      this.prisma.movie.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      this.prisma.movie.count({ where: { status: { not: 'PUBLISHED' }, deletedAt: null } }),
    ]);

    return {
      series,
      episodes,
      movies,
      users,
      activeUsers,
      activeSessions,
      totalViews,
      pendingComments,
      processingFiles,
      recentActivity,
      totals: { series, seasons, episodes, movies, users },
      usersSummary: { total: users, active: activeUsers, activeRecently: recentUserSessions.length, activeSessions },
      views: { total: totalViews, daily: buildDailyViewSeries(dailyRows, dailyStart) },
      content: {
        mostViewed,
        recentlyAdded,
        withoutPoster: seriesWithoutCover + moviesWithoutPoster,
        seriesWithoutCover,
        moviesWithoutPoster,
        episodesWithoutVideo,
      },
      comments: { pending: pendingComments },
      files: { processing: processingFiles, failed: failedFiles, orphaned: storage.orphaned, recentErrors },
      mediaSummary: { active: processingFiles, failed: failedFiles, completed: completedJobs, unassigned: unassignedJobs, published: publishedEpisodes + publishedMovies, drafts: draftEpisodes + draftMovies },
      storage,
      health: { backend: 'ok', database: 'ok', storage: 'ok' },
      generatedAt: now.toISOString(),
    };
  }
}
