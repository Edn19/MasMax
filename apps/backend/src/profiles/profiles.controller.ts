import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateProfileDto, UpdateProfileDto } from './dto';
import { ProfilesService } from './profiles.service';
@UseGuards(JwtAuthGuard) @Controller('profiles')
export class ProfilesController { constructor(private readonly profiles: ProfilesService) {} @Get() list(@CurrentUser() user: JwtUser) { return this.profiles.list(user.sub); } @Post() create(@CurrentUser() user: JwtUser, @Body() dto: CreateProfileDto) { return this.profiles.create(user.sub, dto); } @Patch(':id') update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateProfileDto) { return this.profiles.update(user.sub, id, dto); } @Post(':id/select') select(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.profiles.select(user.sub, id); } @Delete(':id') remove(@CurrentUser() user: JwtUser, @Param('id') id: string) { return this.profiles.remove(user.sub, id); } }
