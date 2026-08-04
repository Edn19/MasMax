import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  BulkCreateEpisodesDto,
  CopyEpisodeSettingsDto,
  CreateEpisodeDto,
  CsvEpisodeImportDto,
  PublishEpisodesDto,
  QueryAdminEpisodesDto,
  ReorderEpisodesDto,
  UpdateEpisodeDto,
} from './dto';
import { EpisodeImportService } from './episode-import.service';
import { EpisodesService } from './episodes.service';

@Controller()
export class EpisodesController {
  constructor(
    private readonly episodes: EpisodesService,
    private readonly imports: EpisodeImportService,
  ) {}

  @Get('episodes/latest')
  @UseGuards(JwtAuthGuard)
  latest() {
    return this.episodes.latest();
  }

  @Get('episodes/:id')
  @UseGuards(JwtAuthGuard)
  byId(@Param('id') id: string, @Ip() ip: string) {
    return this.episodes.byId(id, ip);
  }

  @Get('series/:slug/episodes')
  @UseGuards(JwtAuthGuard)
  bySeries(@Param('slug') slug: string) {
    return this.episodes.bySeriesSlug(slug);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/episodes')
  adminList(@Query() query: QueryAdminEpisodesDto) {
    return this.episodes.adminList(query);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/seasons/:seasonId/episode-gaps')
  gaps(@Param('seasonId') seasonId: string) {
    return this.episodes.gaps(seasonId);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/episodes')
  create(@Body() dto: CreateEpisodeDto) {
    return this.episodes.create(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/episodes/bulk')
  bulkCreate(@Body() dto: BulkCreateEpisodesDto) {
    return this.episodes.bulkCreate(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/episodes/reorder')
  reorder(@Body() dto: ReorderEpisodesDto) {
    return this.episodes.reorder(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/episodes/publish')
  publish(@Body() dto: PublishEpisodesDto) {
    return this.episodes.publish(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/episodes/copy-settings')
  copySettings(@Body() dto: CopyEpisodeSettingsDto) {
    return this.episodes.copySettings(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/episodes/import/preview')
  previewImport(@Body() dto: CsvEpisodeImportDto) {
    return this.imports.preview(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/episodes/import/commit')
  commitImport(@Body() dto: CsvEpisodeImportDto) {
    return this.imports.commit(dto);
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
