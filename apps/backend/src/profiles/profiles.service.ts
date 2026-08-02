import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto, UpdateProfileDto } from './dto';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  list(userId: string) { return this.prisma.profile.findMany({ where: { userId }, select: { id: true, name: true, avatarUrl: true, preferredLanguage: true, isKids: true, createdAt: true, lastUsedAt: true }, orderBy: { createdAt: 'asc' } }); }
  async create(userId: string, dto: CreateProfileDto) { const count = await this.prisma.profile.count({ where: { userId } }); if (count >= Number(this.config.get<string>('MAX_PROFILES_PER_USER') ?? 5)) throw new BadRequestException('Alcanzaste el limite de perfiles'); return this.prisma.profile.create({ data: { userId, name: dto.name.trim(), avatarUrl: dto.avatarUrl?.trim(), preferredLanguage: dto.preferredLanguage ?? 'es', isKids: dto.isKids ?? false, pinHash: dto.pin ? await bcrypt.hash(dto.pin, 12) : null }, select: { id: true, name: true, avatarUrl: true, preferredLanguage: true, isKids: true } }); }
  async update(userId: string, id: string, dto: UpdateProfileDto) { await this.owned(userId, id); return this.prisma.profile.update({ where: { id }, data: { name: dto.name?.trim(), avatarUrl: dto.avatarUrl?.trim(), preferredLanguage: dto.preferredLanguage, isKids: dto.isKids, pinHash: dto.pin ? await bcrypt.hash(dto.pin, 12) : undefined }, select: { id: true, name: true, avatarUrl: true, preferredLanguage: true, isKids: true } }); }
  async select(userId: string, id: string) { await this.owned(userId, id); return this.prisma.profile.update({ where: { id }, data: { lastUsedAt: new Date() }, select: { id: true, name: true, avatarUrl: true, preferredLanguage: true, isKids: true } }); }
  async remove(userId: string, id: string) { await this.owned(userId, id); if (await this.prisma.profile.count({ where: { userId } }) <= 1) throw new BadRequestException('La cuenta debe conservar al menos un perfil'); await this.prisma.profile.delete({ where: { id } }); return { removed: true }; }
  private async owned(userId: string, id: string) { const profile = await this.prisma.profile.findFirst({ where: { id, userId } }); if (!profile) throw new NotFoundException('Perfil no encontrado'); return profile; }
}
