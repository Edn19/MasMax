import { MovieStatus, Prisma } from '@prisma/client';

export function publishedSeriesWhere(extra: Prisma.SeriesWhereInput = {}): Prisma.SeriesWhereInput {
  return { ...extra, deletedAt: null };
}

export function publishedSeasonWhere(extra: Prisma.SeasonWhereInput = {}): Prisma.SeasonWhereInput {
  return { ...extra, deletedAt: null, published: true, series: publishedSeriesWhere() };
}

export function publishedEpisodeWhere(extra: Prisma.EpisodeWhereInput = {}): Prisma.EpisodeWhereInput {
  return {
    ...extra,
    deletedAt: null,
    published: true,
    season: publishedSeasonWhere(),
    series: publishedSeriesWhere(),
  };
}

export function publishedMovieWhere(extra: Prisma.MovieWhereInput = {}): Prisma.MovieWhereInput {
  return { ...extra, deletedAt: null, status: MovieStatus.PUBLISHED };
}
