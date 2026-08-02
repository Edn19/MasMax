import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CreateInvitationDto, CreateUserDto, UpdatePasswordDto, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get('invitations') invitations() { return this.users.listInvitations(); }
  @Post('invitations') createInvitation(@Body() dto: CreateInvitationDto, @CurrentUser() user: JwtUser) { return this.users.createInvitation(dto, user.sub); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser: JwtUser) {
    return this.users.update(id, dto, currentUser.sub);
  }

  @Patch(':id/password')
  updatePassword(@Param('id') id: string, @Body() dto: UpdatePasswordDto) {
    return this.users.updatePassword(id, dto);
  }

  @Delete(':id/sessions') revokeSessions(@Param('id') id: string, @CurrentUser() user: JwtUser) { return this.users.revokeSessions(id, user.sub); }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() currentUser: JwtUser) {
    return this.users.remove(id, currentUser.sub);
  }
}
