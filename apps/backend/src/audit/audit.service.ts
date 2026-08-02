import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditInput = {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  changes?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput) {
    return this.prisma.auditLog.create({ data: input });
  }

  list(page = 1, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
    return this.prisma.auditLog.findMany({
      include: { actor: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(page, 1) - 1) * take,
      take,
    });
  }
}
