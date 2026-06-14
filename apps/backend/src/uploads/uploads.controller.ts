import { BadRequestException, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

const uploadRoot = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
const videoDir = path.join(uploadRoot, 'videos');
const imageDir = path.join(uploadRoot, 'images');
mkdirSync(videoDir, { recursive: true });
mkdirSync(imageDir, { recursive: true });

const maxVideoBytes = Number(process.env.MAX_VIDEO_UPLOAD_MB ?? 2048) * 1024 * 1024;
const maxImageBytes = Number(process.env.UPLOAD_MAX_MB ?? 20) * 1024 * 1024;
const extensions: Record<string, string> = {
  'video/mp4': '.mp4',
  'application/mp4': '.mp4',
  'application/octet-stream': '.mp4',
  '': '.mp4',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/x-icon': '.ico',
};
const storage = (destination: string, prefix: string) =>
  diskStorage({
    destination,
    filename: (_request, file, callback) =>
      callback(null, `${prefix}-${Date.now()}-${randomUUID()}${extensions[file.mimetype.toLowerCase()] ?? ''}`),
  });

function filterMime(allowed: string[]) {
  return (_request: Express.Request, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) => {
    if (!allowed.includes(file.mimetype.toLowerCase())) {
      callback(new BadRequestException(`Formato no permitido: ${file.mimetype}`), false);
      return;
    }
    callback(null, true);
  };
}

const allowedVideoMimeTypes = ['video/mp4', 'application/mp4', 'application/octet-stream', ''];
const multerVideoOptions = {
  storage: diskStorage({
    destination: videoDir,
    filename: (_request: Express.Request, _file: Express.Multer.File, callback: (error: Error | null, filename: string) => void) =>
      callback(null, `video-${Date.now()}-${randomUUID()}.mp4`),
  }),
  limits: { fileSize: maxVideoBytes },
  fileFilter: (
    _request: Express.Request,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const mimeType = (file.mimetype ?? '').toLowerCase();
    const isMp4 = extension === '.mp4';
    const mimeAllowed = allowedVideoMimeTypes.includes(mimeType);

    if (isMp4 && mimeAllowed) {
      callback(null, true);
      return;
    }

    callback(
      new BadRequestException(
        `Formato no permitido. Solo se permite MP4. Archivo recibido: ${file.originalname}, mimetype: ${file.mimetype || '(vacio)'}`,
      ),
      false,
    );
  },
};

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/uploads')
export class UploadsController {
  @Post('video')
  @UseInterceptors(FileInterceptor('file', multerVideoOptions))
  uploadVideo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibio ningun archivo');
    return {
      url: `/uploads/videos/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: storage(imageDir, 'image'),
      limits: { fileSize: maxImageBytes },
      fileFilter: filterMime(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon']),
    }),
  )
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Debes seleccionar una imagen');
    return { url: `/uploads/images/${file.filename}`, mimeType: file.mimetype, size: file.size };
  }
}
