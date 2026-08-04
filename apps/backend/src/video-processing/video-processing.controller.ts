import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { VideoProcessingService } from './video-processing.service';
import { AssociateVideoProcessingDto, ConfigureVideoProcessingDto, EnqueueVideoProcessingDto } from './video-processing.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/video-processing')
export class VideoProcessingController {
  constructor(private readonly processing: VideoProcessingService) {}
  @Get() list() { return this.processing.list(); }
  @Get('worker-health') health() { return this.processing.health(); }
  @Post('media/:mediaFileId') enqueue(@CurrentUser() user: JwtUser, @Param('mediaFileId') mediaFileId: string, @Body() dto: EnqueueVideoProcessingDto) { return this.processing.enqueue(user.sub, mediaFileId, dto); }
  @Get(':id') get(@Param('id') id: string) { return this.processing.get(id); }
  @Post(':id/retry') retry(@Param('id') id: string) { return this.processing.retry(id); }
  @Post(':id/associate') associate(@Param('id') id: string, @Body() dto: AssociateVideoProcessingDto) { return this.processing.associate(id, dto); }
  @Patch(':id/settings') configure(@Param('id') id: string, @Body() dto: ConfigureVideoProcessingDto) { return this.processing.configure(id, dto); }
  @Delete(':id') cancel(@Param('id') id: string) { return this.processing.cancel(id); }
}
