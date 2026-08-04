import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { GenreDto } from './dto';
import { GenresService } from './genres.service';

@Controller()
export class GenresController {
  constructor(private readonly genres: GenresService) {}

  @Get('genres')
  @UseGuards(JwtAuthGuard)
  list() {
    return this.genres.list();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin/genres')
  create(@Body() dto: GenreDto) {
    return this.genres.create(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/genres/:id')
  update(@Param('id') id: string, @Body() dto: GenreDto) {
    return this.genres.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/genres/:id')
  remove(@Param('id') id: string) {
    return this.genres.remove(id);
  }
}
