import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dto';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('comments/:episodeId')
  list(@Param('episodeId') episodeId: string) {
    return this.comments.list(episodeId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('comments')
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: JwtUser) {
    return this.comments.create(dto, user.sub);
  }

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
