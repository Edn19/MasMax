import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, mergeMap } from 'rxjs';
import { JwtUser } from '../common/current-user.decorator';
import { RequestWithContext, requestMetadata } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

type AdminRequest = RequestWithContext & { user?: JwtUser; body?: Record<string, unknown>; params: Record<string, string> };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: AuditService, private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (!this.shouldAudit(request)) return next.handle();

    const descriptor = this.describe(request);
    const before = await this.snapshot(descriptor.entity, descriptor.entityId).catch(() => undefined);
    return next.handle().pipe(mergeMap(async (result: unknown) => {
      try {
        const resultId = result && typeof result === 'object'
          ? String((result as Record<string, unknown>).id ?? (result as Record<string, unknown>).mediaId ?? descriptor.entityId ?? '') || undefined
          : descriptor.entityId;
        const actions = this.effectiveActions(descriptor.actions, before, result);
        await Promise.all(actions.map((action) => this.audit.record({
          actorId: request.user?.sub, action, entity: descriptor.entity, entityId: resultId,
          ...requestMetadata(request), changes: request.body, before,
          after: this.afterValue(request, result),
          metadata: { method: request.method, path: request.route?.path ?? request.path },
        })));
      } catch (error) {
        this.logger.error('La operacion termino, pero no se pudo guardar su auditoria', error);
      }
      return result;
    }));
  }

  private shouldAudit(request: AdminRequest) {
    const path = request.originalUrl.split('?')[0];
    return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)
      && /\/api\/admin(?:\/|$)/.test(path)
      && !/\/episodes\/import\/preview$/.test(path)
      && !/\/uploads\/resumable\/[^/]+\/parts$/.test(path);
  }

  private describe(request: AdminRequest) {
    const path = request.originalUrl.split('?')[0];
    const segments = path.split('/').filter(Boolean);
    const adminIndex = segments.indexOf('admin');
    const resource = segments[adminIndex + 1] ?? 'operation';
    const entity = entityName(resource, path);
    const entityId = request.params.id ?? request.params.mediaFileId;
    const body = request.body ?? {};
    let action: string;
    const userActions: string[] = [];

    if (/\/users\/invitations$/.test(path)) action = 'USER_INVITED';
    else if (/\/users\/[^/]+\/password$/.test(path)) action = 'USER_PASSWORD_CHANGED';
    else if (/\/users\/[^/]+\/sessions$/.test(path)) action = 'USER_SESSIONS_REVOKED';
    else if (resource === 'users' && request.method === 'PATCH') {
      if (body.role !== undefined) userActions.push('PERMISSIONS_CHANGED');
      if (body.active === false) userActions.push('USER_BLOCKED');
      if (body.active === true) userActions.push('USER_ACTIVATED');
      action = userActions[0] ?? 'USER_UPDATED';
    }
    else if (['settings', 'site-settings'].includes(resource)) action = 'SITE_SETTINGS_CHANGED';
    else if (/\/storage\/cleanup$/.test(path)) action = 'FILES_CLEANED';
    else if (request.method === 'DELETE' && ['storage', 'subtitles'].includes(resource)) action = 'FILE_DELETED';
    else if (/\/uploads\/resumable$/.test(path)) action = 'FILE_UPLOAD_INITIATED';
    else if (/\/uploads\/resumable\/[^/]+\/complete$/.test(path)) action = 'FILE_UPLOAD_COMPLETED';
    else if (resource === 'uploads' && request.method === 'DELETE') action = 'FILE_UPLOAD_CANCELLED';
    else if (resource === 'uploads' && request.method === 'POST') action = 'FILE_UPLOADED';
    else if (/\/episodes\/bulk$/.test(path)) action = 'EPISODES_BULK_CREATED';
    else if (/\/episodes\/copy-settings$/.test(path)) action = 'EPISODE_SETTINGS_COPIED';
    else if (/\/episodes\/import\/commit$/.test(path)) action = 'EPISODES_IMPORTED';
    else if (resource === 'episodes' && /\/publish$/.test(path)) action = body.published === true ? 'CONTENT_PUBLISHED' : 'CONTENT_UNPUBLISHED';
    else if (/\/video-processing\/media\/[^/]+$/.test(path)) action = 'VIDEO_PROCESSING_QUEUED';
    else if (/\/video-processing\/[^/]+\/retry$/.test(path)) action = 'VIDEO_PROCESSING_RETRIED';
    else if (resource === 'video-processing' && request.method === 'DELETE') action = 'VIDEO_PROCESSING_CANCELLED';
    else if (/\/media\/[^/]+\/publish$/.test(path)) action = 'CONTENT_PUBLISHED';
    else if (/\/media\/[^/]+\/unpublish$/.test(path)) action = 'CONTENT_UNPUBLISHED';
    else if (/\/media\/[^/]+\/retry$/.test(path)) action = 'VIDEO_PROCESSING_RETRIED';
    else if (/\/media\/[^/]+\/cancel$/.test(path)) action = 'VIDEO_PROCESSING_CANCELLED';
    else if (/\/media\/[^/]+\/hls$/.test(path)) action = 'HLS_DELETED';
    else if (/\/media\/[^/]+\/original$/.test(path)) action = 'ORIGINAL_MEDIA_DELETED';
    else if (request.method === 'PATCH' && body.published !== undefined) action = body.published === true ? 'CONTENT_PUBLISHED' : 'CONTENT_UNPUBLISHED';
    else if (request.method === 'PATCH' && body.status === 'PUBLISHED') action = 'CONTENT_PUBLISHED';
    else if (request.method === 'PATCH' && ['DRAFT', 'HIDDEN'].includes(String(body.status))) action = 'CONTENT_UNPUBLISHED';
    else if (/\/retention\/cleanup$/.test(path)) action = 'AUDIT_RETENTION_APPLIED';
    else action = `${toConstant(entity)}_${request.method === 'POST' ? 'CREATED' : request.method === 'DELETE' ? 'DELETED' : 'UPDATED'}`;

    return { actions: userActions.length ? userActions : [action], entity, entityId };
  }

  private afterValue(request: AdminRequest, result: unknown) {
    if (/\/password$/.test(request.originalUrl)) return { passwordChanged: true };
    return result;
  }

  private effectiveActions(actions: string[], before: unknown, after: unknown) {
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return actions;
    const previous = before as Record<string, unknown>;
    const current = after as Record<string, unknown>;
    const effective = actions.filter((action) => {
      if (action === 'PERMISSIONS_CHANGED') return previous.role !== current.role;
      if (action === 'USER_BLOCKED') return previous.active !== false && current.active === false;
      if (action === 'USER_ACTIVATED') return previous.active !== true && current.active === true;
      return true;
    });
    return effective.length ? effective : ['USER_UPDATED'];
  }

  private snapshot(entity: string, id?: string): Promise<unknown> {
    if (entity === 'SiteSetting') return this.prisma.siteSetting.findFirst();
    if (!id) return Promise.resolve(undefined);
    switch (entity) {
      case 'User': return this.prisma.user.findUnique({ where: { id } });
      case 'Series': return this.prisma.series.findUnique({ where: { id }, include: { genres: true } });
      case 'Season': return this.prisma.season.findUnique({ where: { id } });
      case 'Episode': return this.prisma.episode.findUnique({ where: { id } });
      case 'Movie': return this.prisma.movie.findUnique({ where: { id }, include: { genres: true } });
      case 'Genre': return this.prisma.genre.findUnique({ where: { id } });
      case 'Comment': return this.prisma.comment.findUnique({ where: { id } });
      case 'SubtitleTrack': return this.prisma.subtitleTrack.findUnique({ where: { id } });
      case 'MediaFile': return this.prisma.mediaFile.findUnique({ where: { id } });
      case 'VideoProcessingJob': return this.prisma.videoProcessingJob.findUnique({ where: { id } });
      case 'ResumableUpload': return this.prisma.resumableUpload.findUnique({ where: { id } });
      default: return Promise.resolve(undefined);
    }
  }
}

function entityName(resource: string, path: string) {
  if (/\/users\/invitations$/.test(path)) return 'Invitation';
  if (resource === 'site-settings' || resource === 'settings') return 'SiteSetting';
  if (resource === 'video-processing') return 'VideoProcessingJob';
  if (resource === 'subtitles') return 'SubtitleTrack';
  if (resource === 'storage') return 'MediaFile';
  if (resource === 'uploads') return path.includes('/resumable') ? 'ResumableUpload' : 'MediaFile';
  const singular: Record<string, string> = { users: 'User', series: 'Series', seasons: 'Season', episodes: 'Episode', movies: 'Movie', genres: 'Genre', comments: 'Comment', audit: 'AuditLog' };
  return singular[resource] ?? resource;
}

function toConstant(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-z0-9]+/gi, '_').toUpperCase();
}
