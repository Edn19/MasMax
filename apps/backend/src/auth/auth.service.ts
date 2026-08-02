import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { parseDuration } from '../common/config';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto';

type Metadata = { ipAddress?: string; userAgent?: string; requestId?: string; deviceName?: string };
type PublicUser = { id: string; email: string; role: 'USER' | 'ADMIN'; name: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService, private readonly audit: AuditService) {}

  async register(dto: RegisterDto, metadata: Metadata) {
    const mode = this.config.get<string>('REGISTRATION_MODE') ?? 'disabled';
    if (mode === 'disabled' || mode === 'admin_only') throw new ForbiddenException('El registro publico esta desactivado');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('El email ya existe');

    const role = mode === 'invite' ? await this.consumeInvitation(dto.invitationToken, email) : Role.USER;
    const user = await this.prisma.user.create({
      data: { email, name: dto.name.trim(), role, passwordHash: await bcrypt.hash(dto.password, 12), profiles: { create: { name: dto.name.trim() } } },
    });
    await this.audit.record({ actorId: user.id, action: 'REGISTER', entity: 'User', entityId: user.id, ...metadata });
    return this.createSession(user, metadata);
  }

  async login(dto: LoginDto, metadata: Metadata) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const now = new Date();
    if (user?.lockedUntil && user.lockedUntil > now) throw new UnauthorizedException('Cuenta bloqueada temporalmente. Intenta mas tarde');
    const valid = Boolean(user && user.active && !user.deletedAt && await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid) {
      if (user) await this.recordFailedLogin(user.id, metadata);
      await this.audit.record({ actorId: user?.id, action: 'LOGIN_FAILED', entity: 'Session', ...metadata, changes: { email } });
      throw new UnauthorizedException('Credenciales invalidas');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    await this.audit.record({ actorId: user.id, action: 'LOGIN', entity: 'Session', ...metadata });
    return this.createSession(user, metadata);
  }

  async refresh(token: string | undefined, metadata: Metadata) {
    if (!token) throw new UnauthorizedException('No existe una sesion para renovar');
    let payload: { sub: string; sid: string; family: string; type: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Refresh token invalido o vencido');
    }
    const session = await this.prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active || session.user.deletedAt) {
      throw new UnauthorizedException('La sesion ya no esta activa');
    }
    if (payload.type !== 'refresh' || !(await bcrypt.compare(token, session.refreshTokenHash))) {
      await this.prisma.session.updateMany({ where: { tokenFamily: payload.family, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'REFRESH_TOKEN_REUSE' } });
      await this.audit.record({ actorId: payload.sub, action: 'REFRESH_REUSE_DETECTED', entity: 'Session', entityId: payload.sid, ...metadata });
      throw new UnauthorizedException('Se detecto reutilizacion de credenciales; las sesiones relacionadas fueron revocadas');
    }
    return this.rotateSession(session, metadata);
  }

  async logout(sessionId: string, userId: string, metadata: Metadata) {
    await this.prisma.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'LOGOUT' } });
    await this.audit.record({ actorId: userId, action: 'LOGOUT', entity: 'Session', entityId: sessionId, ...metadata });
    return { loggedOut: true };
  }

  sessions(userId: string) {
    return this.prisma.session.findMany({ where: { userId }, select: { id: true, deviceName: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, revocationReason: true }, orderBy: { lastUsedAt: 'desc' } });
  }

  async revokeSession(userId: string, sessionId: string, metadata: Metadata) {
    await this.prisma.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'USER_REVOKED' } });
    await this.audit.record({ actorId: userId, action: 'SESSION_REVOKED', entity: 'Session', entityId: sessionId, ...metadata });
    return { revoked: true };
  }

  async revokeOthers(userId: string, currentSessionId: string, metadata: Metadata) {
    const result = await this.prisma.session.updateMany({ where: { userId, id: { not: currentSessionId }, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'USER_REVOKED_OTHERS' } });
    await this.audit.record({ actorId: userId, action: 'OTHER_SESSIONS_REVOKED', entity: 'Session', ...metadata, changes: { count: result.count } });
    return { revoked: result.count };
  }

  async revokeAll(userId: string, metadata: Metadata) {
    const result = await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'USER_REVOKED_ALL' } });
    await this.audit.record({ actorId: userId, action: 'ALL_SESSIONS_REVOKED', entity: 'Session', ...metadata, changes: { count: result.count } });
    return { revoked: result.count };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (user?.active && !user.deletedAt) {
      const raw = randomBytes(32).toString('base64url');
      await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: this.hashToken(raw), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
      if (this.config.get<string>('DEV_LOG_PASSWORD_RESET') === 'true') {
        this.logger.warn(`Enlace de desarrollo: ${this.config.get<string>('APP_PUBLIC_URL')}/reset-password?token=${raw}`);
      }
    }
    return { message: 'Si el correo existe, recibiras instrucciones para restablecer la contrasena' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.password !== dto.confirmPassword) throw new BadRequestException('Las contrasenas no coinciden');
    const reset = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: this.hashToken(dto.token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw new BadRequestException('El enlace es invalido o ha vencido');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(dto.password, 12), mustChangePassword: false } }),
      this.prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'PASSWORD_RESET' } }),
    ]);
    return { updated: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, sessionId: string, metadata: Metadata) {
    if (dto.newPassword !== dto.confirmPassword) throw new BadRequestException('Las contrasenas no coinciden');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new BadRequestException('La contrasena actual es incorrecta');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12), mustChangePassword: false } }),
      this.prisma.session.updateMany({ where: { userId, id: { not: sessionId }, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'PASSWORD_CHANGED' } }),
    ]);
    await this.audit.record({ actorId: userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId, ...metadata });
    return { updated: true };
  }

  async me(userId: string) {
    return this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true, createdAt: true } });
  }

  private async createSession(user: PublicUser, metadata: Metadata) {
    const refreshMs = parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d', 30 * 86_400_000);
    const session = await this.prisma.session.create({ data: { userId: user.id, refreshTokenHash: 'pending', tokenFamily: randomUUID(), deviceName: metadata.deviceName, userAgent: metadata.userAgent, ipAddress: metadata.ipAddress, expiresAt: new Date(Date.now() + refreshMs) } });
    return this.rotateSession({ ...session, user }, metadata);
  }

  private async rotateSession(session: { id: string; tokenFamily: string; expiresAt: Date; user: PublicUser }, metadata: Metadata) {
    const payload = { sub: session.user.id, sid: session.id, family: session.tokenFamily, type: 'refresh' };
    const refreshToken = await this.jwt.signAsync(payload, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d' });
    await this.prisma.session.update({ where: { id: session.id }, data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12), lastUsedAt: new Date(), userAgent: metadata.userAgent, ipAddress: metadata.ipAddress } });
    const accessPayload = { sub: session.user.id, email: session.user.email, role: session.user.role, name: session.user.name, sid: session.id };
    const accessToken = await this.jwt.signAsync(accessPayload, { secret: this.config.getOrThrow<string>('JWT_SECRET'), expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m' });
    return { accessToken, refreshToken, expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m', user: accessPayload };
  }

  private async recordFailedLogin(userId: string, metadata: Metadata) {
    const max = Number(this.config.get<string>('LOGIN_MAX_ATTEMPTS') ?? 5);
    const minutes = Number(this.config.get<string>('LOGIN_LOCK_MINUTES') ?? 15);
    const user = await this.prisma.user.update({ where: { id: userId }, data: { failedLoginAttempts: { increment: 1 } }, select: { failedLoginAttempts: true } });
    if (user.failedLoginAttempts >= max) await this.prisma.user.update({ where: { id: userId }, data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + minutes * 60_000) } });
    void metadata;
  }

  private async consumeInvitation(token: string | undefined, email: string) {
    if (!token) throw new ForbiddenException('Se requiere una invitacion valida');
    const invitation = await this.prisma.invitation.findUnique({ where: { tokenHash: this.hashToken(token) } });
    if (!invitation || invitation.revokedAt || invitation.expiresAt <= new Date() || invitation.usedCount >= invitation.maxUses || (invitation.email && invitation.email.toLowerCase() !== email)) throw new ForbiddenException('La invitacion no es valida');
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { usedCount: { increment: 1 } } });
    return invitation.role;
  }

  private hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
