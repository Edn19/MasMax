import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SeasonsService } from './seasons.service';

describe('SeasonsService', () => {
  it('lista solo temporadas de la serie y ordena por numero', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new SeasonsService({ season: { findMany } } as unknown as PrismaService);

    await service.list('series-a');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { seriesId: 'series-a', deletedAt: null },
      orderBy: { number: 'asc' },
    }));
  });

  it('permite temporada 1 en dos series distintas', async () => {
    const transaction = {
      series: { findFirst: vi.fn().mockResolvedValue({ id: 'existing-series' }) },
      season: {
        aggregate: vi.fn().mockResolvedValue({ _max: { number: null } }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `season-${data.seriesId}`, ...data })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as unknown as PrismaService;
    const service = new SeasonsService(prisma);

    await service.create({ seriesId: 'series-a', number: 1, title: 'Temporada 1' });
    await service.create({ seriesId: 'series-b', number: 1, title: 'Temporada 1' });

    expect(transaction.season.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ seriesId: 'series-a', number: 1 }),
    }));
    expect(transaction.season.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ seriesId: 'series-b', number: 1 }),
    }));
  });

  it('rechaza el mismo numero dentro de la misma serie', async () => {
    const transaction = {
      series: { findFirst: vi.fn().mockResolvedValue({ id: 'series-a' }) },
      season: {
        aggregate: vi.fn().mockResolvedValue({ _max: { number: 1 } }),
        findFirst: vi.fn().mockResolvedValue({ id: 'season-a-1' }),
        create: vi.fn(),
      },
    };
    const service = new SeasonsService({
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as unknown as PrismaService);

    await expect(service.create({ seriesId: 'series-a', number: 1, title: 'Duplicada' }))
      .rejects.toMatchObject({ message: 'La serie ya tiene una temporada con ese numero.' });
    expect(transaction.season.create).not.toHaveBeenCalled();
  });

  it('devuelve 404 al crear para una serie inexistente', async () => {
    const transaction = {
      series: { findFirst: vi.fn().mockResolvedValue(null) },
      season: { aggregate: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    };
    const service = new SeasonsService({
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as unknown as PrismaService);

    await expect(service.create({ seriesId: 'missing', number: 1, title: 'Temporada 1' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('renumera a un numero libre, actualiza campos y conserva la serie original', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: 'season-1', seriesId: 'series-original', number: 2 })
      .mockResolvedValueOnce(null);
    const update = vi.fn().mockResolvedValue({ id: 'season-1', seriesId: 'series-original' });
    const service = new SeasonsService({ season: { findFirst, update } } as unknown as PrismaService);

    await service.update('season-1', {
      number: 3,
      title: '  Titulo actualizado  ',
      description: '  Descripcion actualizada  ',
      posterUrl: '  /uploads/images/poster.jpg  ',
      published: true,
    });

    const call = update.mock.calls[0]?.[0];
    expect(call.data).toEqual({
      number: 3,
      title: 'Titulo actualizado',
      description: 'Descripcion actualizada',
      posterUrl: '/uploads/images/poster.jpg',
      published: true,
    });
    expect(call.data).not.toHaveProperty('seriesId');
    expect(findFirst).toHaveBeenNthCalledWith(2, {
      where: { seriesId: 'series-original', number: 3, id: { not: 'season-1' } },
      select: { id: true },
    });
  });

  it('rechaza renumerar si el numero ya existe en la misma serie', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: 'season-2', seriesId: 'series-a', number: 2 })
      .mockResolvedValueOnce({ id: 'season-3' });
    const update = vi.fn();
    const service = new SeasonsService({ season: { findFirst, update } } as unknown as PrismaService);

    await expect(service.update('season-2', { number: 3 }))
      .rejects.toMatchObject({ message: 'La serie ya tiene una temporada con ese numero.' });
    expect(update).not.toHaveBeenCalled();
  });

  it('traduce P2002 sin exponer el codigo de Prisma', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['seriesId', 'number'] },
    });
    const service = new SeasonsService({
      season: {
        findFirst: vi.fn().mockResolvedValue({ id: 'season-1', seriesId: 'series-a', number: 1 }),
        update: vi.fn().mockRejectedValue(prismaError),
      },
    } as unknown as PrismaService);

    const result = service.update('season-1', { title: 'Nuevo titulo' });
    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.toMatchObject({ message: 'La serie ya tiene una temporada con ese numero.' });
  });

  it('devuelve 404 al actualizar una temporada inexistente', async () => {
    const service = new SeasonsService({
      season: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    } as unknown as PrismaService);

    await expect(service.update('missing', { title: 'Nuevo titulo' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
