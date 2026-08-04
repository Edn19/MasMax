import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { MediaValidationService } from './media-validation.service';
import { ResumableUploadService } from './resumable-upload.service';
import { VideoProcessingModule } from '../video-processing/video-processing.module';

@Module({
  imports: [VideoProcessingModule],
  controllers: [UploadsController],
  providers: [MediaValidationService, ResumableUploadService],
})
export class UploadsModule {}
