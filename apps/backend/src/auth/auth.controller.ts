import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RequestWithContext, requestMetadata } from '../common/request-context';
import { AuthService } from './auth.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login') async login(@Body() dto: LoginDto, @Req() req: RequestWithContext, @Res({ passthrough: true }) res: Response) { const result = await this.auth.login(dto, requestMetadata(req)); this.setRefreshCookie(res, result.refreshToken); return this.publicResult(result); }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register') async register(@Body() dto: RegisterDto, @Req() req: RequestWithContext, @Res({ passthrough: true }) res: Response) { const result = await this.auth.register(dto, requestMetadata(req)); this.setRefreshCookie(res, result.refreshToken); return this.publicResult(result); }
  @Post('refresh') @HttpCode(200) async refresh(@Req() req: RequestWithContext, @Res({ passthrough: true }) res: Response) { const result = await this.auth.refresh((req as Request).cookies?.refreshToken as string | undefined, requestMetadata(req)); this.setRefreshCookie(res, result.refreshToken); return this.publicResult(result); }
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password') forgot(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto); }
  @Post('reset-password') reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto); }

  @UseGuards(JwtAuthGuard) @Post('logout') @HttpCode(200) async logout(@CurrentUser() user: JwtUser, @Req() req: RequestWithContext, @Res({ passthrough: true }) res: Response) { this.clearRefreshCookie(res); return this.auth.logout(user.sid, user.sub, requestMetadata(req)); }
  @UseGuards(JwtAuthGuard) @Get('me') me(@CurrentUser() user: JwtUser) { return this.auth.me(user.sub); }
  @UseGuards(JwtAuthGuard) @Get('sessions') sessions(@CurrentUser() user: JwtUser) { return this.auth.sessions(user.sub); }
  @UseGuards(JwtAuthGuard) @Get('sessions/current') current(@CurrentUser() user: JwtUser) { return { sessionId: user.sid }; }
  @UseGuards(JwtAuthGuard) @Delete('sessions/:id') revoke(@Param('id') id: string, @CurrentUser() user: JwtUser, @Req() req: RequestWithContext) { return this.auth.revokeSession(user.sub, id, requestMetadata(req)); }
  @UseGuards(JwtAuthGuard) @Post('sessions/revoke-others') revokeOthers(@CurrentUser() user: JwtUser, @Req() req: RequestWithContext) { return this.auth.revokeOthers(user.sub, user.sid, requestMetadata(req)); }
  @UseGuards(JwtAuthGuard) @Post('sessions/revoke-all') async revokeAll(@CurrentUser() user: JwtUser, @Req() req: RequestWithContext, @Res({ passthrough: true }) res: Response) { this.clearRefreshCookie(res); return this.auth.revokeAll(user.sub, requestMetadata(req)); }
  @UseGuards(JwtAuthGuard) @Post('change-password') changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: JwtUser, @Req() req: RequestWithContext) { return this.auth.changePassword(user.sub, dto, user.sid, requestMetadata(req)); }

  private publicResult<T extends { refreshToken: string }>(result: T) { const { refreshToken: _refreshToken, ...safe } = result; return safe; }
  private setRefreshCookie(response: Response, token: string) { response.cookie('refreshToken', token, { httpOnly: true, secure: this.config.get<string>('COOKIE_SECURE') === 'true', sameSite: 'lax', path: '/api/auth', maxAge: parseInt(this.config.get<string>('JWT_REFRESH_COOKIE_MAX_AGE_MS') ?? '2592000000', 10) }); }
  private clearRefreshCookie(response: Response) { response.clearCookie('refreshToken', { httpOnly: true, secure: this.config.get<string>('COOKIE_SECURE') === 'true', sameSite: 'lax', path: '/api/auth' }); }
}
