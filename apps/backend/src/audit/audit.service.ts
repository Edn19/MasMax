import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeAuditValue } from './audit-sanitizer';

export type AuditInput = {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  changes?: unknown;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export type AuditQuery = {
  page?: number;
  limit?: number;
  actorId?: string;
  user?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private retentionTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  onModuleInit() {
    void this.applyRetention().catch((error: unknown) => this.logger.error('No se pudo aplicar la retencion de auditoria', error));
    this.retentionTimer = setInterval(() => {
      void this.applyRetention().catch((error: unknown) => this.logger.error('No se pudo aplicar la retencion de auditoria', error));
    }, 86_400_000);
    this.retentionTimer.unref();
  }

  onModuleDestroy() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  record(input: AuditInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent?.slice(0, 500),
        requestId: input.requestId,
        changes: auditJson(input.changes),
        before: auditJson(input.before),
        after: auditJson(input.after),
        metadata: auditJson(input.metadata),
      },
    });
  }

  async list(query: AuditQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const where = this.where(query);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) };
  }

  async facets() {
    const [actions, entities, actors] = await Promise.all([
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
      this.prisma.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, email: true, name: true }, orderBy: { email: 'asc' }, take: 500 }),
    ]);
    return { actions: actions.map((item) => item.action), entities: entities.map((item) => item.entity), actors };
  }

  async exportCsv(query: AuditQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: this.where(query),
      include: { actor: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    const header = ['fecha', 'usuario', 'email', 'accion', 'entidad', 'entidad_id', 'ip', 'user_agent', 'request_id', 'anterior', 'nuevo'];
    const lines = rows.map((row) => [
      row.createdAt.toISOString(), row.actor?.name ?? 'Sistema', row.actor?.email ?? '', row.action, row.entity,
      row.entityId ?? '', row.ipAddress ?? '', row.userAgent ?? '', row.requestId ?? '',
      JSON.stringify(row.before ?? ''), JSON.stringify(row.after ?? row.changes ?? ''),
    ].map(csvCell).join(','));
    return `\uFEFF${header.join(',')}\n${lines.join('\n')}`;
  }

  async applyRetention() {
    const days = this.retentionDays();
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return { removed: result.count, days, cutoff: cutoff.toISOString() };
  }

  retentionPolicy() {
    return { days: this.retentionDays(), exportLimit: 10_000 };
  }

  private retentionDays() {
    const configured = Number(this.config.get<string>('AUDIT_RETENTION_DAYS') ?? 365);
    return Number.isInteger(configured) && configured >= 30 ? Math.min(configured, 3650) : 365;
  }

  private where(query: AuditQuery): Prisma.AuditLogWhereInput {
    return {
      actorId: query.actorId,
      action: query.action,
      entity: query.entity,
      createdAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
      actor: query.user ? { is: { OR: [
        { email: { contains: query.user, mode: 'insensitive' } },
        { name: { contains: query.user, mode: 'insensitive' } },
      ] } } : undefined,
    };
  }
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function auditJson(value: unknown): Prisma.InputJsonValue | undefined {
  const sanitized = sanitizeAuditValue(value);
  return sanitized === null ? undefined : sanitized as Prisma.InputJsonValue | undefined;
}
