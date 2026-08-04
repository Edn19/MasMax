import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdatePasswordDto, UpdateUserDto } from './dto';
import { createHash, randomBytes } from 'crypto';
import { CreateInvitationDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('El email ya esta registrado');
    }
    return this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: dto.role,
        active: dto.active ?? true,
      },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
  }

  async update(id: string, dto: UpdateUserDto, currentUserId: string) {
    if (id === currentUserId && (dto.role === Role.USER || dto.active === false)) {
      throw new BadRequestException('No puedes quitar tus propios permisos ni desactivar tu cuenta');
    }
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new BadRequestException('Usuario no encontrado');
    if (target.role === Role.ADMIN && (dto.role === Role.USER || dto.active === false)) await this.ensureAnotherAdmin(id);
    const email = dto.email?.trim().toLowerCase();
    if (email) {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== id) throw new ConflictException('El email ya esta registrado');
    }
    return this.prisma.user.update({
      where: { id },
      data: { ...dto, email, name: dto.name?.trim() },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
  }

  async updatePassword(id: string, dto: UpdatePasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contrasenas no coinciden');
    }
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(dto.password, 12) },
    });
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'ADMIN_PASSWORD_RESET' } });
    return { updated: true };
  }

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta');
    }
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!target) throw new BadRequestException('Usuario no encontrado');
    if (target.role === Role.ADMIN) await this.ensureAnotherAdmin(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), active: false, email: `deleted-${id}@invalid.local`, name: 'Usuario eliminado' } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'USER_DELETED' } }),
    ]);
    return { id };
  }

  async revokeSessions(id: string, _actorId: string) { const result = await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'ADMIN_REVOKED' } }); return { revoked: result.count }; }
  listInvitations() { return this.prisma.invitation.findMany({ select: { id: true, email: true, role: true, expiresAt: true, maxUses: true, usedCount: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  async createInvitation(dto: CreateInvitationDto, creatorId: string) { const token = randomBytes(32).toString('base64url'); const invitation = await this.prisma.invitation.create({ data: { creatorId, email: dto.email?.trim().toLowerCase(), role: dto.role, expiresAt: new Date(Date.now() + dto.expiresHours * 3_600_000), maxUses: dto.maxUses, tokenHash: createHash('sha256').update(token).digest('hex') }, select: { id: true, email: true, role: true, expiresAt: true, maxUses: true } }); return { ...invitation, token }; }

  private async ensureAnotherAdmin(excludedId: string) { const count = await this.prisma.user.count({ where: { id: { not: excludedId }, role: Role.ADMIN, active: true, deletedAt: null } }); if (!count) throw new BadRequestException('No se puede eliminar, desactivar ni degradar al ultimo administrador activo'); }
}
