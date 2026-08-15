import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { SeasonsController } from './seasons.controller';

describe('SeasonsController', () => {
  it.each([
    ['list', 'series/:seriesId/seasons', RequestMethod.GET],
    ['create', 'seasons', RequestMethod.POST],
    ['update', 'seasons/:id', RequestMethod.PATCH],
    ['remove', 'seasons/:id', RequestMethod.DELETE],
  ] as const)('mantiene %s en la ruta esperada', (method, path, requestMethod) => {
    const handler = SeasonsController.prototype[method];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
  });

  it('requiere sesion ADMIN para editar temporadas', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SeasonsController)).toEqual([JwtAuthGuard, AdminGuard]);
  });
});
