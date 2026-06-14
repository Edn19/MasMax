import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { UploadExceptionFilter } from './common/upload-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        directives: {
          frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://drive.google.com'],
          mediaSrc: ["'self'", 'https:', 'blob:'],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.useStaticAssets(config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalFilters(new UploadExceptionFilter());
  const frontendUrl =
    config.get<string>('FRONTEND_URL') ?? 'http://localhost:8088,http://localhost:8080';
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

  await app.listen(config.get<number>('PORT') ?? config.get<number>('API_PORT') ?? 3000);
}

void bootstrap();
