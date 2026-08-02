import { describe, expect, it, vi } from 'vitest';
import { FavoritesService } from './favorites.service';

describe('FavoritesService', () => {
  const prisma = { favorite: { create: vi.fn() } };
  const service = new FavoritesService(prisma as never);
  it('rechaza favoritos sin destino', async () => { await expect(service.create('user', {})).rejects.toThrow('episodeId o movieId'); });
  it('rechaza favoritos con dos destinos', async () => { await expect(service.create('user', { episodeId: 'e', movieId: 'm' })).rejects.toThrow('episodeId o movieId'); });
});
