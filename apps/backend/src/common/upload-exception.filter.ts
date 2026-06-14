import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError)
export class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const message =
      exception.code === 'LIMIT_FILE_SIZE'
        ? `El archivo supera el limite de ${process.env.MAX_VIDEO_UPLOAD_MB ?? 2048} MB`
        : exception.message;
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message,
      error: 'Bad Request',
    });
  }
}
