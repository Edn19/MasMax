import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { EpisodesController } from '../episodes/episodes.controller';
import { EpisodesService } from '../episodes/episodes.service';
import { MoviesController } from '../movies/movies.controller';
import { SeriesController } from '../series/series.controller';
import { StorageController } from '../storage/storage.controller';
import { JwtAuthGuard } from './jwt-auth.guard';

function methodGuards(controller: object, method: string) {
  const prototype = Object.getPrototypeOf(controller) as Record<string, unknown>;
  return (Reflect.getMetadata(GUARDS_METADATA, prototype[method] as object) ?? []) as Array<new (...args: never[]) => unknown>;
}

describe('catalog security baseline', () => {
  const cases: Array<[object, string]> = [
    [new SeriesController({} as never), 'list'],
    [new SeriesController({} as never), 'featured'],
    [new SeriesController({} as never), 'bySlug'],
    [new MoviesController({} as never), 'list'],
    [new MoviesController({} as never), 'bySlug'],
    [new MoviesController({} as never), 'recommendations'],
    [new EpisodesController({} as never, {} as never), 'latest'],
    [new EpisodesController({} as never, {} as never), 'byId'],
    [new EpisodesController({} as never, {} as never), 'bySeries'],
  ];

  it.each(cases)('%s.%s requiere JWT', (controller, method) => {
    expect(methodGuards(controller, method)).toContain(JwtAuthGuard);
  });

  it('protege manifiestos y segmentos HLS en storage', () => {
    const controller = new StorageController({} as never);
    expect(methodGuards(controller, 'hlsMaster')).toContain(JwtAuthGuard);
    expect(methodGuards(controller, 'hlsVariant')).toContain(JwtAuthGuard);
  });
});

describe('published episode visibility baseline', () => {
  it('latest exige serie padre visible', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new EpisodesService({ episode: { findMany } } as never, {} as never);
    await service.latest();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        series: expect.objectContaining({ deletedAt: null }),
      }),
    }));
  });
});
