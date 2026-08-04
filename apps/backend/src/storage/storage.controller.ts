import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { ObjectStorageService } from './object-storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: ObjectStorageService) {}
  @Get('objects/images/:filename')
  async image(@Param('filename') filename: string, @Res() response: Response) {
    if (!/^[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(filename)) throw new NotFoundException('Imagen no encontrada');
    const key = `images/${filename}`;
    if (!await this.storage.exists(key)) throw new NotFoundException('Imagen no encontrada');
    response.redirect(302, await this.storage.temporaryUrl(key, 300));
  }
  @Get('objects/hls/:jobId/master.m3u8')
  @UseGuards(JwtAuthGuard, AdminGuard)
  hlsMaster(@Param('jobId') jobId: string, @Res() response: Response) { return this.hlsObject(jobId, 'master.m3u8', response); }
  @Get('objects/hls/:jobId/:profile/:filename')
  @UseGuards(JwtAuthGuard, AdminGuard)
  hlsVariant(@Param('jobId') jobId: string, @Param('profile') profile: string, @Param('filename') filename: string, @Res() response: Response) { return this.hlsObject(jobId, `${profile}/${filename}`, response); }
  private async hlsObject(jobId: string, suffix: string, response: Response) {
    if (!/^[a-z0-9]+$/i.test(jobId) || !/^(?:master\.m3u8|\d{2,4}\/(?:index\.m3u8|segment-\d{5}\.ts))$/.test(suffix)) throw new NotFoundException('Recurso HLS no encontrado');
    const key = `hls/${jobId}/${suffix}`;
    if (!await this.storage.exists(key)) throw new NotFoundException('Recurso HLS no encontrado');
    response.redirect(302, await this.storage.temporaryUrl(key, 300));
  }
}
