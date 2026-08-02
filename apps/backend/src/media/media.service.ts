import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizeMediaDto } from './dto';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async authorize(userId: string, sessionId: string, dto: AuthorizeMediaDto) {
    if (Boolean(dto.episodeId) === Boolean(dto.movieId)) throw new BadRequestException('Envia episodeId o movieId');
    const resource = dto.episodeId
      ? await this.prisma.episode.findFirst({ where: { id: dto.episodeId, deletedAt: null }, select: { videoUrl: true } })
      : await this.prisma.movie.findFirst({ where: { id: dto.movieId, deletedAt: null, status: 'PUBLISHED' }, select: { videoUrl: true } });
    if (!resource) throw new NotFoundException('Contenido no encontrado');
    if (!/^\/uploads\/videos\/[a-zA-Z0-9._-]+\.mp4$/.test(resource.videoUrl)) return { url: resource.videoUrl, protected: false };
    const path = resource.videoUrl.replace(/^\/uploads\//, '');
    const expires = Math.floor(Date.now() / 1000) + Number(this.config.get<string>('MEDIA_URL_EXPIRES_SECONDS') ?? 300);
    const claims = { userId, sessionId, path, expires, episodeId: dto.episodeId ?? '', movieId: dto.movieId ?? '' };
    const signature = this.sign(claims);
    const query = new URLSearchParams({ uid: userId, sid: sessionId, path, exp: String(expires), eid: claims.episodeId, mid: claims.movieId, sig: signature });
    return { url: `/api/media/stream?${query}`, protected: true, expiresAt: new Date(expires * 1000).toISOString() };
  }

  async validateAndLog(query: Record<string, string | undefined>, ip?: string) {
    const claims = { userId: query.uid ?? '', sessionId: query.sid ?? '', path: query.path ?? '', expires: Number(query.exp), episodeId: query.eid ?? '', movieId: query.mid ?? '' };
    if (!claims.userId || !claims.sessionId || !claims.path || !Number.isInteger(claims.expires) || claims.expires < Math.floor(Date.now() / 1000)) throw new ForbiddenException('La URL multimedia ha vencido');
    if (!/^videos\/[a-zA-Z0-9._-]+\.mp4$/.test(claims.path)) throw new ForbiddenException('Ruta multimedia invalida');
    const expected = Buffer.from(this.sign(claims));
    const received = Buffer.from(query.sig ?? '');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new ForbiddenException('Firma multimedia invalida');
    const session = await this.prisma.session.findFirst({ where: { id: claims.sessionId, userId: claims.userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!session) throw new ForbiddenException('La sesion no esta activa');
    await this.prisma.viewLog.create({ data: { userId: claims.userId, sessionId: claims.sessionId, episodeId: claims.episodeId || null, movieId: claims.movieId || null, ip } });
    return `/protected-media/${claims.path}`;
  }

  private sign(claims: { userId: string; sessionId: string; path: string; expires: number; episodeId: string; movieId: string }) {
    return createHmac('sha256', this.config.getOrThrow<string>('MEDIA_SIGNING_SECRET')).update([claims.userId, claims.sessionId, claims.path, claims.expires, claims.episodeId, claims.movieId].join('|')).digest('base64url');
  }
}
