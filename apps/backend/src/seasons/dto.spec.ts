import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateSeasonDto, UpdateSeasonDto } from './dto';

const validationOptions = { whitelist: true, forbidNonWhitelisted: true } as const;

describe('DTO de temporadas', () => {
  it('acepta seriesId al crear y transforma el numero', async () => {
    const dto = plainToInstance(CreateSeasonDto, { seriesId: 'series-1', number: '2', published: true });
    expect(await validate(dto, validationOptions)).toHaveLength(0);
    expect(dto.number).toBe(2);
  });

  it('rechaza crear una temporada sin seriesId', async () => {
    const errors = await validate(plainToInstance(CreateSeasonDto, { number: 1 }), validationOptions);
    expect(errors.some((error) => error.property === 'seriesId')).toBe(true);
  });

  it.each([
    ['title', 'Nuevo titulo'],
    ['description', 'Nueva descripcion'],
    ['posterUrl', '/uploads/images/poster.jpg'],
    ['published', true],
  ] as const)('acepta actualizar %s sin seriesId', async (field, value) => {
    const errors = await validate(plainToInstance(UpdateSeasonDto, { [field]: value }), validationOptions);
    expect(errors).toHaveLength(0);
  });

  it('rechaza seriesId en una actualizacion estricta', async () => {
    const errors = await validate(plainToInstance(UpdateSeasonDto, { seriesId: 'series-2', title: 'Nuevo titulo' }), validationOptions);
    expect(errors.some((error) => error.property === 'seriesId' && error.constraints?.whitelistValidation)).toBe(true);
  });
});
