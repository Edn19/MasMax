import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { MediaValidationService } from './media-validation.service';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { CompleteResumableUploadDto, InitiateResumableUploadDto, UploadPartDto } from './resumable-upload.dto';
import { ResumableUploadService } from './resumable-upload.service';
import { VideoProcessingService } from '../video-processing/video-processing.service';

const uploadRoot = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
const tempDir = path.join(uploadRoot, 'tmp');
mkdirSync(tempDir, { recursive: true });
const temporaryStorage = diskStorage({ destination: tempDir, filename: (_request, _file, callback) => callback(null, `${Date.now()}-${randomUUID()}.upload`) });
const allowedVideoMimeTypes = ['video/mp4', 'application/mp4', 'application/octet-stream', ''];
const resumableChunkStorage = diskStorage({ destination: tempDir, filename: (_request, _file, callback) => callback(null, `${Date.now()}-${randomUUID()}.chunk-upload`) });

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly validation: MediaValidationService, private readonly resumable: ResumableUploadService, private readonly processing: VideoProcessingService) {}

  @Post('resumable')
  initiate(@CurrentUser() user: JwtUser, @Body() dto: InitiateResumableUploadDto) { return this.resumable.initiate(user.sub, dto); }

  @Get('resumable')
  active(@CurrentUser() user: JwtUser) { return this.resumable.list(user.sub); }

  @Get('resumable/:id')
  status(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.resumable.status(user.sub, id); }

  @Post('resumable/:id/parts')
  @Throttle({ default: { limit: 600, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: resumableChunkStorage, limits: { fileSize: Number(process.env.RESUMABLE_CHUNK_SIZE_MB ?? 8) * 1024 * 1024, files: 1, fields: 4, parts: 5 } }))
  part(@CurrentUser() user: JwtUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadPartDto) { if (!file) throw new BadRequestException('No se recibio la parte del archivo'); return this.resumable.uploadPart(user.sub, id, file, dto); }

  @Post('resumable/:id/complete')
  complete(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: CompleteResumableUploadDto) { return this.resumable.complete(user.sub, id, dto); }

  @Delete('resumable/:id')
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.resumable.cancel(user.sub, id); }
  @Post('video')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: temporaryStorage, limits: { fileSize: Number(process.env.MAX_VIDEO_UPLOAD_MB ?? 2048) * 1024 * 1024, files: 1, fields: 0, parts: 1 }, fileFilter: (_request, file, callback) => { const extension = path.extname(file.originalname).toLowerCase(); const mime = (file.mimetype ?? '').toLowerCase(); if (extension === '.mp4' && allowedVideoMimeTypes.includes(mime)) callback(null, true); else callback(new BadRequestException(`Formato no permitido. Solo se permite MP4. Archivo recibido: ${file.originalname}, mimetype: ${file.mimetype || '(vacio)'}`), false); } }))
  async uploadVideo(@CurrentUser() user: JwtUser, @UploadedFile() file?: Express.Multer.File) { if (!file) throw new BadRequestException('No se recibio ningun archivo'); const result = await this.validation.validateVideo(file); return { ...result, processingJob: await this.processing.enqueue(user.sub, result.mediaId) }; }

  @Post('image')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: temporaryStorage, limits: { fileSize: Number(process.env.UPLOAD_MAX_MB ?? 20) * 1024 * 1024, files: 1, fields: 0, parts: 1 }, fileFilter: (_request, file, callback) => { const extension = path.extname(file.originalname).toLowerCase(); const mime = (file.mimetype ?? '').toLowerCase(); callback(null, [['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp']].some(([allowedExtension, allowedMime]) => extension === allowedExtension && mime === allowedMime)); } }))
  uploadImage(@UploadedFile() file?: Express.Multer.File) { if (!file) throw new BadRequestException('Debes seleccionar una imagen JPG, PNG o WebP'); return this.validation.validateImage(file); }
}
