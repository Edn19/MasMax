import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateSeasonDto, UpdateSeasonDto } from './dto';
import { SeasonsService } from './seasons.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class SeasonsController {
  constructor(private readonly seasons: SeasonsService) {}

  @Get('series/:seriesId/seasons') list(@Param('seriesId') seriesId: string) { return this.seasons.list(seriesId); }
  @Post('seasons') create(@Body() dto: CreateSeasonDto) { return this.seasons.create(dto); }
  @Patch('seasons/:id') update(@Param('id') id: string, @Body() dto: UpdateSeasonDto) { return this.seasons.update(id, dto); }
  @Delete('seasons/:id') remove(@Param('id') id: string) { return this.seasons.remove(id); }
}
