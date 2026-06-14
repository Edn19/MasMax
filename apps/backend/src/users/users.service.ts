import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdatePasswordDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
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
    return { updated: true };
  }

  remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta');
    }
    return this.prisma.user.delete({ where: { id }, select: { id: true } });
  }
}
