import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateSubtitleDto, QuerySubtitlesDto, UpdateSubtitleDto } from './dto';
import { SubtitlesService } from './subtitles.service';

const uploadRoot = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads');
const tempDir = join(uploadRoot, 'tmp');
mkdirSync(tempDir, { recursive: true });
const storage = diskStorage({ destination: tempDir, filename: (_request, _file, callback) => callback(null, `${Date.now()}-${randomUUID()}.subtitle-upload`) });
const allowedMimes = ['text/vtt', 'text/plain', 'application/x-subrip', 'application/octet-stream', ''];

@Controller()
export class SubtitlesController {
  constructor(private readonly subtitles: SubtitlesService) {}

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/subtitles')
  list(@Query() query: QuerySubtitlesDto) { return this.subtitles.list(query); }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/subtitles')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { storage, limits: { fileSize: Number(process.env.MAX_SUBTITLE_UPLOAD_KB ?? 1024) * 1024 }, fileFilter: (_request, file, callback) => { const extension = extname(file.originalname).toLowerCase(); const mime = (file.mimetype ?? '').toLowerCase(); if (['.vtt', '.srt'].includes(extension) && allowedMimes.includes(mime)) callback(null, true); else callback(new BadRequestException(`Formato no permitido. Solo se aceptan VTT o SRT. Archivo: ${file.originalname}, mimetype: ${file.mimetype || '(vacio)'}`), false); } }))
  create(@UploadedFile() file: Express.Multer.File | undefined, @Body() dto: CreateSubtitleDto) { if (!file) throw new BadRequestException('No se recibio ningun archivo de subtitulos'); return this.subtitles.create(file, dto); }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/subtitles/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSubtitleDto) { return this.subtitles.update(id, dto); }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/subtitles/:id/preview')
  async preview(@Param('id') id: string, @Res() response: Response) { response.type('text/vtt').send(await this.subtitles.content(id, true)); }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/subtitles/:id')
  remove(@Param('id') id: string) { return this.subtitles.remove(id); }

  @UseGuards(JwtAuthGuard)
  @Get('subtitles/:id/content')
  async content(@Param('id') id: string, @Res() response: Response) { response.setHeader('Cache-Control', 'private, max-age=300'); response.type('text/vtt').send(await this.subtitles.content(id)); }
}
