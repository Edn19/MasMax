import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { VideoProcessingController } from './video-processing.controller';

describe('VideoProcessingController', () => {
  it.each([
    ['jobs', 'jobs', RequestMethod.GET],
    ['activeJobs', 'jobs/active', RequestMethod.GET],
    ['availableJobs', 'jobs/available', RequestMethod.GET],
    ['byTarget', 'jobs/by-target/:targetType/:targetId', RequestMethod.GET],
    ['getJob', 'jobs/:id', RequestMethod.GET],
    ['cancelJob', 'jobs/:id/cancel', RequestMethod.POST],
    ['retryJob', 'jobs/:id/retry', RequestMethod.POST],
  ] as const)('expone %s en la ruta persistente esperada', (method, path, requestMethod) => {
    const handler = VideoProcessingController.prototype[method];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(requestMethod);
  });

  it('protege todas las rutas con sesion ADMIN', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, VideoProcessingController)).toEqual([JwtAuthGuard, AdminGuard]);
  });
});
