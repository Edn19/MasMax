import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizeMediaDto } from './dto';
import { ObjectStorageService } from '../storage/object-storage.service';
import { publishedEpisodeWhere, publishedMovieWhere } from '../common/content-visibility';
import { posix } from 'path';
import { EpisodePlaybackReadinessService } from '../playback/episode-playback-readiness.service';

type HlsClaims = { userId: string; sessionId: string; jobId: string; expires: number; episodeId: string; movieId: string };

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly storage: ObjectStorageService, private readonly playback: EpisodePlaybackReadinessService) {}

  async authorize(userId: string, sessionId: string, dto: AuthorizeMediaDto, ip?: string) {
    if (Boolean(dto.episodeId) === Boolean(dto.movieId)) throw new BadRequestException('Envia episodeId o movieId');
    const resource = dto.episodeId
      ? await this.prisma.episode.findFirst({ where: publishedEpisodeWhere({ id: dto.episodeId }), select: { videoUrl: true, processedVideoUrl: true, remuxedVideoUrl: true, originalVideoUrl: true, playbackMode: true, mediaFileId: true, videoType: true } })
      : await this.prisma.movie.findFirst({ where: publishedMovieWhere({ id: dto.movieId }), select: { videoUrl: true, processedVideoUrl: true, originalVideoUrl: true, videoType: true } }).then((movie) => movie ? { ...movie, mediaFileId: null, remuxedVideoUrl: null, playbackMode: movie.videoType === 'HLS' ? 'HLS' as const : 'ORIGINAL' as const } : null);
    if (!resource) throw new NotFoundException('Contenido no encontrado');
    const episodeReadiness = dto.episodeId ? await this.playback.getEpisode(dto.episodeId) : null;
    if (dto.episodeId && !episodeReadiness?.readiness.playable) throw new NotFoundException(episodeReadiness?.readiness.message ?? 'El video del contenido aun no esta disponible');
    const selectedUrl = episodeReadiness?.readiness.url ?? (resource.playbackMode === 'HLS' ? resource.processedVideoUrl : resource.playbackMode === 'REMUX' ? resource.remuxedVideoUrl : resource.originalVideoUrl);
    const mediaUrl = selectedUrl || resource.videoUrl;
    if (!mediaUrl) throw new NotFoundException('El video del contenido aun no esta disponible');
    const path = this.storage.keyFromUrl(mediaUrl);
    const expires = Math.floor(Date.now() / 1000) + Number(this.config.get<string>('MEDIA_URL_EXPIRES_SECONDS') ?? 300);
    const hls = path?.match(/^hls\/([a-zA-Z0-9_-]+)\/master\.m3u8$/);
    if (hls) {
      if (!await this.storage.exists(path!)) {
        this.logger.warn(`media_missing type=hls content=${dto.episodeId ? 'episode' : 'movie'} id=${dto.episodeId ?? dto.movieId}`);
        throw new NotFoundException('La fuente HLS seleccionada no esta disponible');
      }
      const claims: HlsClaims = { userId, sessionId, jobId: hls[1], expires, episodeId: dto.episodeId ?? '', movieId: dto.movieId ?? '' };
      const token = this.createHlsToken(claims);
      const url = `/api/media/hls?token=${encodeURIComponent(token)}&path=master.m3u8`;
      return { url, type: 'hls' as const, playback: { type: 'hls' as const, url }, protected: true, expiresAt: new Date(expires * 1000).toISOString(), originalUrl: resource.originalVideoUrl };
    }
    if (!path || !/^videos\/[a-zA-Z0-9._-]+\.mp4$/.test(path)) {
      const type = /\.m3u8(?:$|[?#])/i.test(mediaUrl) ? 'hls' as const : resource.playbackMode === 'REMUX' ? 'remux' as const : 'original' as const;
      return { url: mediaUrl, type, playback: { type, url: mediaUrl }, protected: false, originalUrl: resource.originalVideoUrl };
    }
    if (!await this.storage.exists(path)) {
      this.logger.warn(`media_missing type=${resource.playbackMode.toLowerCase()} content=${dto.episodeId ? 'episode' : 'movie'} id=${dto.episodeId ?? dto.movieId}`);
      throw new NotFoundException('La fuente de video seleccionada no esta disponible');
    }
    if (this.storage.driverName === 's3') {
      await this.prisma.viewLog.create({ data: { userId, sessionId, episodeId: dto.episodeId || null, movieId: dto.movieId || null, ip } });
      const url = await this.storage.temporaryUrl(path, expires - Math.floor(Date.now() / 1000));
      const type = resource.playbackMode === 'REMUX' ? 'remux' as const : 'original' as const;
      return { url, type, playback: { type, url }, protected: true, expiresAt: new Date(expires * 1000).toISOString(), originalUrl: resource.originalVideoUrl };
    }
    const claims = { userId, sessionId, path, expires, episodeId: dto.episodeId ?? '', movieId: dto.movieId ?? '' };
    const signature = this.sign(claims);
    const query = new URLSearchParams({ uid: userId, sid: sessionId, path, exp: String(expires), eid: claims.episodeId, mid: claims.movieId, sig: signature });
    const url = `/api/media/stream?${query}`;
    const type = resource.playbackMode === 'REMUX' ? 'remux' as const : 'original' as const;
    return { url, type, playback: { type, url }, protected: true, expiresAt: new Date(expires * 1000).toISOString(), originalUrl: resource.originalVideoUrl };
  }

  async deliverHls(query: Record<string, string | undefined>, ip?: string) {
    const claims = await this.validateHlsToken(query.token ?? '');
    const relativePath = query.path ?? '';
    if (!/^(?:master\.m3u8|\d{2,4}\/(?:index\.m3u8|segment-\d{5}\.(?:ts|m4s)|init\.mp4))$/.test(relativePath)) {
      throw new ForbiddenException('Ruta HLS invalida');
    }
    const key = `hls/${claims.jobId}/${relativePath}`;
    if (!await this.storage.exists(key)) throw new NotFoundException('Recurso HLS no encontrado');
    if (relativePath.endsWith('.m3u8')) {
      const manifest = (await this.storage.read(key)).toString('utf8');
      return { kind: 'manifest' as const, content: this.rewriteManifest(manifest, relativePath, query.token ?? '') };
    }
    await this.prisma.viewLog.create({ data: { userId: claims.userId, sessionId: claims.sessionId, episodeId: claims.episodeId || null, movieId: claims.movieId || null, ip } });
    if (this.storage.driverName === 'local') {
      return { kind: 'local' as const, redirect: `/protected-media/${key}`, contentType: relativePath.endsWith('.ts') ? 'video/mp2t' : 'video/mp4' };
    }
    const remaining = Math.max(1, claims.expires - Math.floor(Date.now() / 1000));
    return { kind: 'remote' as const, url: await this.storage.temporaryUrl(key, remaining) };
  }

  async validateAndLog(query: Record<string, string | undefined>, ip?: string) {
    if (this.storage.driverName !== 'local') throw new ForbiddenException('La entrega local no esta habilitada');
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

  private createHlsToken(claims: HlsClaims) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.config.getOrThrow<string>('MEDIA_SIGNING_SECRET')).update(`hls|${payload}`).digest('base64url');
    return `${payload}.${signature}`;
  }

  private async validateHlsToken(token: string) {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) throw new ForbiddenException('Token HLS invalido');
    const expected = Buffer.from(createHmac('sha256', this.config.getOrThrow<string>('MEDIA_SIGNING_SECRET')).update(`hls|${payload}`).digest('base64url'));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new ForbiddenException('Token HLS invalido');
    let claims: HlsClaims;
    try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as HlsClaims; }
    catch { throw new ForbiddenException('Token HLS invalido'); }
    if (!claims.userId || !claims.sessionId || !/^[a-zA-Z0-9_-]+$/.test(claims.jobId) || !Number.isInteger(claims.expires) || claims.expires < Math.floor(Date.now() / 1000)) throw new ForbiddenException('Token HLS vencido');
    const session = await this.prisma.session.findFirst({ where: { id: claims.sessionId, userId: claims.userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!session) throw new ForbiddenException('La sesion no esta activa');
    return claims;
  }

  private rewriteManifest(content: string, currentPath: string, token: string) {
    const base = posix.dirname(currentPath);
    const signed = (entry: string) => {
      if (/^[a-z]+:/i.test(entry) || entry.startsWith('//')) throw new ForbiddenException('El manifiesto HLS contiene una ruta externa');
      const normalized = posix.normalize(posix.join(base, entry));
      if (normalized.startsWith('../') || normalized.startsWith('/')) throw new ForbiddenException('El manifiesto HLS contiene una ruta invalida');
      return `/api/media/hls?token=${encodeURIComponent(token)}&path=${encodeURIComponent(normalized)}`;
    };
    return content.split(/\r?\n/).map((line) => {
      if (!line || line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${signed(uri)}"`);
      return signed(line.trim());
    }).join('\n');
  }
}
