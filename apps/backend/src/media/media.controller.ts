import { Controller, Get, Ip, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthorizeMediaDto } from './dto';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @UseGuards(JwtAuthGuard) @Get('authorize') authorize(@CurrentUser() user: JwtUser, @Query() dto: AuthorizeMediaDto) { return this.media.authorize(user.sub, user.sid, dto); }
  @Get('stream') async stream(@Query() query: Record<string, string>, @Ip() ip: string, @Res() response: Response) { const redirect = await this.media.validateAndLog(query, ip); response.setHeader('X-Accel-Redirect', redirect); response.setHeader('Cache-Control', 'private, no-store'); response.status(200).end(); }
}
