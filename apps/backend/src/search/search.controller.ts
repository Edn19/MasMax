import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { toCatalogResponse } from '../common/catalog-response';
import { publishedEpisodeWhere, publishedMovieWhere, publishedSeriesWhere } from '../common/content-visibility';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

enum SearchType { SERIES = 'series', MOVIES = 'movies', EPISODES = 'episodes' }

class SearchDto {
  @IsString() @MinLength(2) q!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsEnum(SearchType) type?: SearchType;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @Type(() => Number) @IsInt() year?: number;
}

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(@Query() dto: SearchDto) {
    const skip = (dto.page - 1) * dto.limit;
    const text = { contains: dto.q, mode: 'insensitive' as const };
    const [series, movies, episodes] = await Promise.all([
      dto.type && dto.type !== SearchType.SERIES ? [] : this.prisma.series.findMany({
        where: publishedSeriesWhere({ title: text, year: dto.year, genres: dto.genre ? { some: { slug: dto.genre } } : undefined }),
        include: { genres: true }, skip, take: dto.limit,
      }),
      dto.type && dto.type !== SearchType.MOVIES ? [] : this.prisma.movie.findMany({
        where: publishedMovieWhere({ title: text, releaseYear: dto.year, genres: dto.genre ? { some: { slug: dto.genre } } : undefined }),
        include: { genres: true }, skip, take: dto.limit,
      }),
      dto.type && dto.type !== SearchType.EPISODES ? [] : this.prisma.episode.findMany({
        where: publishedEpisodeWhere({ title: text }), include: { series: true }, skip, take: dto.limit,
      }),
    ]);
    return toCatalogResponse({ query: dto.q, page: dto.page, limit: dto.limit, series, movies, episodes });
  }
}
