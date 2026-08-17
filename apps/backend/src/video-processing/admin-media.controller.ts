import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdminMediaQueryDto, SelectableMediaQueryDto } from './admin-media.dto';
import { AdminMediaService } from './admin-media.service';
import { EnqueueVideoProcessingDto } from './video-processing.dto';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: AdminMediaService) {}

  @Get() list(@Query() query: AdminMediaQueryDto) { return this.media.list(query); }
  @Get('selectable') selectable(@Query() query: SelectableMediaQueryDto) { return this.media.listSelectable(query.search); }
  @Post(':id/transcode') transcode(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: EnqueueVideoProcessingDto) { return this.media.transcode(id, user.sub, dto); }
  @Post(':id/remux') remux(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: EnqueueVideoProcessingDto) { return this.media.remux(id, user.sub, dto); }
  @Get(':id') get(@Param('id') id: string) { return this.media.get(id); }
  @Post(':id/cancel') cancel(@Param('id') id: string) { return this.media.cancel(id); }
  @Post(':id/retry') retry(@Param('id') id: string) { return this.media.retry(id); }
  @Post(':id/publish') publish(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.media.publish(id, user.sub); }
  @Post(':id/unpublish') unpublish(@Param('id') id: string) { return this.media.unpublish(id); }
  @Delete(':id/hls') deleteHls(@Param('id') id: string) { return this.media.deleteHls(id); }
  @Delete(':id/remux') deleteRemux(@Param('id') id: string) { return this.media.deleteRemux(id); }
  @Delete(':id/original') deleteOriginal(@Param('id') id: string) { return this.media.deleteOriginal(id); }
  @Delete('asset/:id') deleteAsset(@Param('id') id: string) { return this.media.deleteAsset(id); }
}
