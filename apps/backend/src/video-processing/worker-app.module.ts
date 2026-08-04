import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '../common/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { VideoProcessingProcessor } from './video-processing.processor';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), PrismaModule, StorageModule], providers: [VideoProcessingProcessor] })
export class WorkerAppModule {}
