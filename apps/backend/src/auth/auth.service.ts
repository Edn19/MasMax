import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('El email ya existe');

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 12),
      },
    });
    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || !user.active || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    return this.issueToken(user);
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
  }

  private issueToken(user: { id: string; email: string; role: 'USER' | 'ADMIN'; name: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role, name: user.name };
    const accessToken = this.jwt.sign(payload);
    return {
      accessToken,
      token: accessToken,
      user: payload,
    };
  }
}
