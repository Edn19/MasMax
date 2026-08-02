import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, statfs } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  @Get() check() { return this.ready(); }
  @Get('live') live() { return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }; }
  @Get('ready') async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const uploadDir = this.config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads');
      await access(uploadDir);
      const disk = await statfs(uploadDir);
      const ffmpeg = await this.commandAvailable('ffprobe');
      return { status: 'ok', database: 'ok', storage: 'ok', ffmpeg, freeStorageBytes: (BigInt(disk.bavail) * BigInt(disk.bsize)).toString(), uptime: process.uptime(), timestamp: new Date().toISOString() };
    } catch { throw new ServiceUnavailableException('Una dependencia requerida no esta disponible'); }
  }
  private commandAvailable(command: string) { return new Promise<boolean>((resolve) => { const child = spawn(command, ['-version'], { stdio: 'ignore' }); child.once('error', () => resolve(false)); child.once('exit', (code) => resolve(code === 0)); }); }
}
