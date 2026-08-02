import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { MediaValidationService } from './media-validation.service';

@Module({
  controllers: [UploadsController],
  providers: [MediaValidationService],
})
export class UploadsModule {}
