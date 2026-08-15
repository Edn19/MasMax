import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { EpisodesController } from './episodes.controller';

describe('EpisodesController admin detail', () => {
  it('delega la carga del episodio por identificador', async () => {
    const episodes = { adminById: vi.fn().mockResolvedValue({ id: 'episode-1' }) };
    const controller = new EpisodesController(episodes as never, {} as never);
    await expect(controller.adminById('episode-1')).resolves.toEqual({ id: 'episode-1' });
    expect(episodes.adminById).toHaveBeenCalledWith('episode-1');
  });

  it('protege la actualizacion con sesion ADMIN', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EpisodesController.prototype.update)).toEqual([JwtAuthGuard, AdminGuard]);
    const guard = new AdminGuard();
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { role: 'USER' } }) }) };
    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
