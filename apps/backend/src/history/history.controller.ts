import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { HistoryQueryDto, UpdateProgressDto } from './dto';
import { HistoryService } from './history.service';

@UseGuards(JwtAuthGuard)
@Controller('me')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}
  @Get('watch-history') list(@CurrentUser() user: JwtUser, @Query() query: HistoryQueryDto) { return this.history.list(user.sub, query.profileId, query.limit); }
  @Get('continue-watching') continuing(@CurrentUser() user: JwtUser, @Query() query: HistoryQueryDto) { return this.history.list(user.sub, query.profileId, query.limit, true); }
  @Put('progress') update(@CurrentUser() user: JwtUser, @Body() dto: UpdateProgressDto) { return this.history.update(user.sub, dto, user.sid); }
  @Delete('watch-history/:id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.history.remove(user.sub, id); }
  @Delete('watch-history') clear(@CurrentUser() user: JwtUser) { return this.history.clear(user.sub); }
}
