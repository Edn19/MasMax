import { Module } from '@nestjs/common';
import { VideoProcessingController } from './video-processing.controller';
import { VideoProcessingService } from './video-processing.service';
import { AdminMediaController } from './admin-media.controller';
import { AdminMediaService } from './admin-media.service';
import { PlaybackModule } from '../playback/playback.module';

@Module({ imports: [PlaybackModule], controllers: [VideoProcessingController, AdminMediaController], providers: [VideoProcessingService, AdminMediaService], exports: [VideoProcessingService] })
export class VideoProcessingModule {}
