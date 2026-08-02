import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://drive.google.com'],
          mediaSrc: ["'self'", 'https:', 'blob:'],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.use(cookieParser());
  const uploadRoot = config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads');
  app.useStaticAssets(join(uploadRoot, 'images'), { prefix: '/uploads/images/' });
  app.use((request: Request & { requestId?: string }, response: Response, next: NextFunction) => {
    const started = Date.now();
    request.requestId = request.get('x-request-id') ?? randomUUID();
    response.setHeader('x-request-id', request.requestId);
    response.on('finish', () => Logger.log(JSON.stringify({ level: 'info', requestId: request.requestId, method: request.method, path: request.originalUrl, status: response.statusCode, durationMs: Date.now() - started }), 'HTTP'));
    next();
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  const frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
  app.enableCors({
    origin: frontendUrl.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(config.get<number>('PORT') ?? 3000, '0.0.0.0');
}

void bootstrap();
