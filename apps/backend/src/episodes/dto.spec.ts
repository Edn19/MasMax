import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateEpisodeDto, QueryAdminEpisodesDto, UpdateEpisodeDto } from './dto';

describe('CreateEpisodeDto video reference', () => {
  it('acepta processingJobId sin exigir una URL final', async () => {
    const dto = plainToInstance(CreateEpisodeDto, { seriesId: 'series-1', seasonId: 'season-1', episodeNumber: '1', title: 'Episodio piloto', processingJobId: 'job_123' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.episodeNumber).toBe(1);
  });

  it('acepta un borrador sin fuente de video', async () => {
    const dto = plainToInstance(CreateEpisodeDto, { seriesId: 'series-1', seasonId: 'season-1', episodeNumber: 1, title: 'Episodio piloto', published: false });
    expect(await validate(dto)).toEqual([]);
  });

  it('rechaza identificadores de job peligrosos', async () => {
    const dto = plainToInstance(CreateEpisodeDto, { seriesId: 'series-1', seasonId: 'season-1', episodeNumber: 1, title: 'Episodio piloto', processingJobId: '../job' });
    expect((await validate(dto)).some((error) => error.property === 'processingJobId')).toBe(true);
  });
});

describe('UpdateEpisodeDto editor contract', () => {
  it('acepta campos editables y transforma numeros', async () => {
    const dto = plainToInstance(UpdateEpisodeDto, { seasonId: 'season-2', episodeNumber: '4', title: 'Titulo actualizado', durationSec: '120' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.episodeNumber).toBe(4);
    expect(dto.durationSec).toBe(120);
  });

  it('rechaza seriesId y campos internos del formulario', async () => {
    const dto = plainToInstance(UpdateEpisodeDto, { title: 'Titulo actualizado', seriesId: 'series-2', videoMode: 'URL', processingJob: { id: 'job-1' } });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['seriesId', 'videoMode', 'processingJob']));
  });

  it('acepta published booleano y rechaza strings ambiguos', async () => {
    expect(await validate(plainToInstance(UpdateEpisodeDto, { published: true }))).toEqual([]);
    expect(await validate(plainToInstance(UpdateEpisodeDto, { published: false }))).toEqual([]);
    const errors = await validate(plainToInstance(UpdateEpisodeDto, { published: 'true' }));
    expect(errors.some((error) => error.property === 'published')).toBe(true);
  });
});

describe('QueryAdminEpisodesDto list contract', () => {
  it('normaliza busqueda, filtros y paginacion', async () => {
    const dto = plainToInstance(QueryAdminEpisodesDto, { search: '  final  ', published: 'false', videoState: 'MISSING', page: '2', limit: '20' });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ search: 'final', published: false, videoState: 'MISSING', page: 2, limit: 20 });
  });

  it('rechaza filtros de video desconocidos', async () => {
    const errors = await validate(plainToInstance(QueryAdminEpisodesDto, { videoState: 'BROKEN' }));
    expect(errors.some((error) => error.property === 'videoState')).toBe(true);
  });
});
