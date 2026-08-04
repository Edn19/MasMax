import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto, EditCommentDto, UpdateCommentDto } from './dto';
import { Throttle } from '@nestjs/throttler';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('comments/:episodeId')
  @UseGuards(JwtAuthGuard)
  list(@Param('episodeId') episodeId: string) {
    return this.comments.list(episodeId);
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('comments')
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: JwtUser) {
    return this.comments.create(dto, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('comments/:id')
  editOwn(@Param('id') id: string, @Body() dto: EditCommentDto, @CurrentUser() user: JwtUser) { return this.comments.editOwn(id, dto.body, user.sub); }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  removeOwn(@Param('id') id: string, @CurrentUser() user: JwtUser) { return this.comments.removeOwn(id, user.sub); }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('comments/:id/report')
  report(@Param('id') id: string) { return this.comments.report(id); }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/comments')
  adminList() {
    return this.comments.adminList();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/comments/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.comments.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('admin/comments/:id')
  remove(@Param('id') id: string) {
    return this.comments.remove(id);
  }
}
