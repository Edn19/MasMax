import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdminMediaController } from './admin-media.controller';

describe('AdminMediaController', () => {
  it.each([
    ['list', '/', RequestMethod.GET], ['get', ':id', RequestMethod.GET], ['cancel', ':id/cancel', RequestMethod.POST], ['retry', ':id/retry', RequestMethod.POST],
    ['publish', ':id/publish', RequestMethod.POST], ['unpublish', ':id/unpublish', RequestMethod.POST], ['deleteHls', ':id/hls', RequestMethod.DELETE], ['deleteOriginal', ':id/original', RequestMethod.DELETE],
  ] as const)('maps %s to the expected protected route', (method, path, requestMethod) => {
    const handler = AdminMediaController.prototype[method];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
  });

  it('protects every media-library route with authentication and admin role', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminMediaController)).toBe('admin/media');
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminMediaController)).toEqual([JwtAuthGuard, AdminGuard]);
  });
});
