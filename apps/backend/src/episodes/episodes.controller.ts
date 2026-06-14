import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateEpisodeDto, UpdateEpisodeDto } from './dto';
import { EpisodesService } from './episodes.service';

@Controller()
export class EpisodesController {
  constructor(private readonly episodes: EpisodesService) {}

  @Get('episodes/latest')
  latest() {
    return this.episodes.latest();
  }

  @Get('episodes/:id')
  byId(@Param('id') id: string, @Ip() ip: string) {
    return this.episodes.byId(id, ip);
  }

  @Get('series/:slug/episodes')
  bySeries(@Param('slug') slug: string) {
    return this.episodes.bySeriesSlug(slug);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/episodes')
  create(@Body() dto: CreateEpisodeDto) {
    return this.episodes.create(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/episodes/:id')
  update(@Param('id') id: string, @Body() dto: UpdateEpisodeDto) {
    return this.episodes.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/episodes/:id')
  remove(@Param('id') id: string) {
    return this.episodes.remove(id);
  }
}
