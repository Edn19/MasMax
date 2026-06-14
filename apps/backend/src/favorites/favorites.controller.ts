import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CheckFavoriteDto, CreateFavoriteDto } from './dto';
import { FavoritesService } from './favorites.service';

@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.favorites.list(user.sub);
  }

  @Get('check')
  check(@Query() dto: CheckFavoriteDto, @CurrentUser() user: JwtUser) {
    return this.favorites.check(user.sub, dto);
  }

  @Post()
  create(@Body() dto: CreateFavoriteDto, @CurrentUser() user: JwtUser) {
    return this.favorites.create(user.sub, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.favorites.remove(user.sub, id);
  }
}
