import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateSeriesDto, QuerySeriesDto, UpdateSeriesDto } from './dto';
import { SeriesService } from './series.service';

@Controller()
export class SeriesController {
  constructor(private readonly series: SeriesService) {}

  @Get('series')
  @UseGuards(JwtAuthGuard)
  list(@Query() query: QuerySeriesDto) {
    return this.series.list(query);
  }

  @Get('series/featured')
  @UseGuards(JwtAuthGuard)
  featured() {
    return this.series.featured();
  }

  @Get('series/:slug')
  @UseGuards(JwtAuthGuard)
  bySlug(@Param('slug') slug: string, @Ip() ip: string) {
    return this.series.bySlug(slug, ip);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/series')
  adminList() {
    return this.series.listAdmin();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/series')
  create(@Body() dto: CreateSeriesDto) {
    return this.series.create(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/series/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSeriesDto) {
    return this.series.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/series/:id')
  remove(@Param('id') id: string) {
    return this.series.remove(id);
  }
}
