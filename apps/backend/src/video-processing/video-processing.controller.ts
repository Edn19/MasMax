import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { VideoProcessingService } from './video-processing.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/video-processing')
export class VideoProcessingController {
  constructor(private readonly processing: VideoProcessingService) {}
  @Get() list() { return this.processing.list(); }
  @Get('worker-health') health() { return this.processing.health(); }
  @Post('media/:mediaFileId') enqueue(@CurrentUser() user: JwtUser, @Param('mediaFileId') mediaFileId: string) { return this.processing.enqueue(user.sub, mediaFileId); }
  @Get(':id') get(@Param('id') id: string) { return this.processing.get(id); }
  @Post(':id/retry') retry(@Param('id') id: string) { return this.processing.retry(id); }
  @Delete(':id') cancel(@Param('id') id: string) { return this.processing.cancel(id); }
}
