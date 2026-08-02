import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtUser) {
    const [user, session] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true, role: true, active: true, deletedAt: true } }),
      this.prisma.session.findFirst({ where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } }),
    ]);
    if (!user?.active || user.deletedAt || !session) return null;
    return { sub: user.id, email: user.email, name: user.name, role: user.role, sid: payload.sid };
  }
}
