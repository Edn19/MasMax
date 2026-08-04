import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';
import { PrismaService } from './prisma/prisma.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { VideoProcessingService } from './video-processing/video-processing.service';

export class CachedCommandAvailability {
  private readonly result: Promise<boolean>;
  constructor(command: string, runner: (command: string) => Promise<boolean> = commandAvailable) { this.result = runner(command); }
  get() { return this.result; }
}

function commandAvailable(command: string) { return new Promise<boolean>((resolve) => { const child = spawn(command, ['-version'], { stdio: 'ignore' }); child.once('error', () => resolve(false)); child.once('exit', (code) => resolve(code === 0)); }); }

@Controller('health')
export class HealthController {
  private readonly ffprobe = new CachedCommandAvailability('ffprobe');
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService, private readonly processing: VideoProcessingService) {}
  @Get() check() { return this.ready(); }
  @Get('live') live() { return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }; }
  @Get('ready') async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.storage.check();
      const freeBytes = await this.storage.freeBytes();
      const ffmpeg = await this.ffprobe.get();
      const processing = await this.processing.health();
      if (this.processing.isEnabled() && (processing.queue !== 'ok' || processing.worker !== 'ok')) throw new Error('El worker FFmpeg no esta disponible');
      return { status: 'ok', database: 'ok', storage: 'ok', storageDriver: this.storage.driverName, ffmpeg, processing, freeStorageBytes: freeBytes?.toString() ?? null, uptime: process.uptime(), timestamp: new Date().toISOString() };
    } catch { throw new ServiceUnavailableException('Una dependencia requerida no esta disponible'); }
  }
}
