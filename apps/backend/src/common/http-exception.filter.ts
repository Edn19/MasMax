import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MulterError } from 'multer';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { requestId?: string }>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? randomUUID();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message: string | string[] = 'Ocurrio un error inesperado';

    if (exception instanceof MulterError) {
      status = HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el limite configurado' : exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object' && 'message' in body) {
        message = (body as { message: string | string[] }).message;
      }
      code = status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = exception.code === 'P2002' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.code === 'P2002' ? 'El registro ya existe' : 'La operacion no pudo completarse';
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} requestId=${requestId}`, exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(status).json({ statusCode: status, code, message, details: [], requestId });
  }
}
