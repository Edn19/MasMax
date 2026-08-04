import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MulterError } from 'multer';

export function uploadLimitMessage(requestUrl: string) {
  return requestUrl.includes('/uploads/resumable/')
    ? 'El fragmento supera el limite permitido. Revisa RESUMABLE_CHUNK_SIZE_MB y el limite de la peticion.'
    : 'El archivo supera el limite de subida configurado.';
}

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
      status = exception.code === 'LIMIT_FILE_SIZE' ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
      code = exception.code;
      message = exception.code === 'LIMIT_FILE_SIZE' ? uploadLimitMessage(request.originalUrl) : 'La solicitud multipart no cumple los limites permitidos.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object' && 'message' in body) {
        message = (body as { message: string | string[] }).message;
      }
      code = status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`;
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = 'LIMIT_FILE_SIZE';
        message = uploadLimitMessage(request.originalUrl);
      }
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
