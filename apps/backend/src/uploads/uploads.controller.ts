import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { MediaValidationService } from './media-validation.service';
import { Throttle } from '@nestjs/throttler';

const uploadRoot = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
const tempDir = path.join(uploadRoot, 'tmp');
mkdirSync(tempDir, { recursive: true });
const temporaryStorage = diskStorage({ destination: tempDir, filename: (_request, _file, callback) => callback(null, `${Date.now()}-${randomUUID()}.upload`) });
const allowedVideoMimeTypes = ['video/mp4', 'application/mp4', 'application/octet-stream', ''];

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly validation: MediaValidationService) {}
  @Post('video')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: temporaryStorage, limits: { fileSize: Number(process.env.MAX_VIDEO_UPLOAD_MB ?? 2048) * 1024 * 1024 }, fileFilter: (_request, file, callback) => { const extension = path.extname(file.originalname).toLowerCase(); const mime = (file.mimetype ?? '').toLowerCase(); if (extension === '.mp4' && allowedVideoMimeTypes.includes(mime)) callback(null, true); else callback(new BadRequestException(`Formato no permitido. Solo se permite MP4. Archivo recibido: ${file.originalname}, mimetype: ${file.mimetype || '(vacio)'}`), false); } }))
  uploadVideo(@UploadedFile() file?: Express.Multer.File) { if (!file) throw new BadRequestException('No se recibio ningun archivo'); return this.validation.validateVideo(file); }

  @Post('image')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @UseInterceptors(FileInterceptor('file', { storage: temporaryStorage, limits: { fileSize: Number(process.env.UPLOAD_MAX_MB ?? 20) * 1024 * 1024 }, fileFilter: (_request, file, callback) => { const extension = path.extname(file.originalname).toLowerCase(); callback(null, ['.jpg','.jpeg','.png','.webp'].includes(extension)); } }))
  uploadImage(@UploadedFile() file?: Express.Multer.File) { if (!file) throw new BadRequestException('Debes seleccionar una imagen JPG, PNG o WebP'); return this.validation.validateImage(file); }
}
