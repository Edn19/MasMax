import { describe, expect, it } from 'vitest';
import { buildDailyViewSeries, newestContent, rankContent } from './admin.service';

describe('AdminService dashboard helpers', () => {
  it('completa con cero los dias sin reproducciones', () => {
    const start = new Date('2026-08-01T00:00:00.000Z');
    expect(buildDailyViewSeries([
      { day: new Date('2026-08-01T00:00:00.000Z'), views: 3n },
      { day: new Date('2026-08-03T00:00:00.000Z'), views: 7n },
    ], start, 3)).toEqual([
      { date: '2026-08-01', views: 3 },
      { date: '2026-08-02', views: 0 },
      { date: '2026-08-03', views: 7 },
    ]);
  });

  it('ordena contenido por vistas y respeta el limite', () => {
    expect(rankContent([
      { id: '1', type: 'series', title: 'Serie', views: 4 },
      { id: '2', type: 'movie', title: 'Pelicula', views: 12 },
      { id: '3', type: 'episode', title: 'Episodio', views: 8 },
    ], 2).map((item) => item.id)).toEqual(['2', '3']);
  });

  it('combina contenido reciente sin depender de su tipo', () => {
    expect(newestContent([
      { id: 'series', type: 'series', title: 'Serie', createdAt: new Date('2026-07-01') },
      { id: 'movie', type: 'movie', title: 'Pelicula', createdAt: new Date('2026-08-01') },
      { id: 'episode', type: 'episode', title: 'Episodio', createdAt: new Date('2026-07-20') },
    ]).map((item) => item.id)).toEqual(['movie', 'episode', 'series']);
  });
});
