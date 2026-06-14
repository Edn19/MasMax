import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateMovieDto, UpdateMovieDto } from './dto';
import { MoviesService } from './movies.service';

@Controller()
export class MoviesController {
  constructor(private readonly movies: MoviesService) {}

  @Get('movies')
  list() {
    return this.movies.listPublished();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/movies')
  adminList() {
    return this.movies.listAdmin();
  }

  @Get('movies/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.movies.bySlug(slug);
  }

  @Get('movies/:id/recommendations')
  recommendations(@Param('id') id: string) {
    return this.movies.recommendations(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/movies')
  create(@Body() dto: CreateMovieDto) {
    return this.movies.create(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/movies/:id')
  update(@Param('id') id: string, @Body() dto: UpdateMovieDto) {
    return this.movies.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/movies/:id')
  remove(@Param('id') id: string) {
    return this.movies.remove(id);
  }
}
