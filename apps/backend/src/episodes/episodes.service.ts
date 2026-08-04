import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { MediaStatus, Prisma, VideoSource } from '@prisma/client';
import { NormalizedVideo, normalizeVideo } from '../common/video';
import { validatePlaybackMarkers } from '../common/playback-markers';
import { PrismaService } from '../prisma/prisma.service';
import { BulkCreateEpisodesDto, CopyEpisodeSettingsDto, CreateEpisodeDto, PublishEpisodesDto, QueryAdminEpisodesDto, ReorderEpisodesDto, UpdateEpisodeDto } from './dto';
import { toCatalogResponse } from '../common/catalog-response';
import { publishedEpisodeWhere, publishedSeriesWhere } from '../common/content-visibility';

export function findMissingEpisodeNumbers(numbers: number[]) {
  const valid = [...new Set(numbers.filter((number) => Number.isInteger(number) && number > 0))].sort((left, right) => left - right);
  const max = valid.at(-1) ?? 0;
  const present = new Set(valid);
  return { max, missing: Array.from({ length: max }, (_, index) => index + 1).filter((number) => !present.has(number)) };
}

@Injectable()
export class EpisodesService {
  private readonly logger = new Logger(EpisodesService.name);

  constructor(private readonly prisma: PrismaService) {}

  latest() {
    return this.prisma.episode.findMany({
      where: publishedEpisodeWhere(),
      include: { season: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] }, series: { include: { genres: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 24,
    }).then(toCatalogResponse);
  }

  async adminList(query: QueryAdminEpisodesDto) {
    const where: Prisma.EpisodeWhereInput = { deletedAt: null, seriesId: query.seriesId, seasonId: query.seasonId, published: query.published };
    const [items, total] = await Promise.all([
      this.prisma.episode.findMany({ where, include: { season: true, series: true, subtitles: true }, orderBy: [{ season: { number: 'asc' } }, { position: 'asc' }, { number: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.episode.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async bySeriesSlug(slug: string) {
    const series = await this.prisma.series.findFirst({ where: publishedSeriesWhere({ slug }) });
    if (!series) throw new NotFoundException('Serie no encontrada');
    return this.prisma.episode.findMany({
      where: publishedEpisodeWhere({ seriesId: series.id }),
      include: { season: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] } },
      orderBy: [{ season: { number: 'asc' } }, { position: 'asc' }, { number: 'asc' }],
    }).then(toCatalogResponse);
  }

  async byId(id: string, ip?: string) {
    const episode = await this.prisma.episode.findFirst({
      where: publishedEpisodeWhere({ id }),
      include: { season: true, subtitles: { where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { language: 'asc' }] }, series: { include: { genres: true } } },
    });
    if (!episode) throw new NotFoundException('Episodio no encontrado');
    await this.prisma.$transaction([
      this.prisma.episode.update({ where: { id }, data: { views: { increment: 1 } } }),
      this.prisma.viewLog.create({ data: { episodeId: id, seriesId: episode.seriesId, ip } }),
    ]);
    return toCatalogResponse(episode);
  }

  async create(dto: CreateEpisodeDto) {
    const seriesId = dto.seriesId.trim();
    const episodeNumber = Number(dto.episodeNumber);
    if (!seriesId) throw new BadRequestException('Selecciona una serie');
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) throw new BadRequestException('El numero de episodio debe ser un entero mayor que cero');
    if (!dto.videoUrl?.trim()) throw new BadRequestException('La URL del video es obligatoria');
    validatePlaybackMarkers(dto, dto.durationSec);

    const series = await this.prisma.series.findFirst({ where: { id: seriesId, deletedAt: null }, select: { id: true } });
    if (!series) throw new BadRequestException('La serie seleccionada no existe');
    const season = await this.prisma.season.findFirst({ where: dto.seasonId ? { id: dto.seasonId, seriesId, deletedAt: null } : { seriesId, number: 1, deletedAt: null } });
    if (!season) throw new BadRequestException('Selecciona una temporada valida para la serie');

    try {
      const video = normalizeVideo(dto);
      await this.assertLocalReady(video);
      const positionAggregate = await this.prisma.episode.aggregate({
        where: { seasonId: season.id, deletedAt: null },
        _max: { position: true },
      });
      const position = dto.position ?? (positionAggregate._max.position ?? 0) + 1;
      return await this.prisma.episode.create({
        data: { seriesId, seasonId: season.id, number: episodeNumber, position, title: dto.title.trim(), description: dto.description?.trim() || '', videoSource: video.videoSource, videoType: video.videoType, videoUrl: video.videoUrl.trim(), originalVideoUrl: video.originalVideoUrl?.trim() || null, processedVideoUrl: video.processedVideoUrl?.trim() || null, thumbnailUrl: dto.thumbnailUrl?.trim() || null, durationSec: dto.durationSec, introStartSec: dto.introStartSec, introEndSec: dto.introEndSec, recapStartSec: dto.recapStartSec, recapEndSec: dto.recapEndSec, published: dto.published ?? true, publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date() },
        include: { season: true, series: true, subtitles: true },
      });
    } catch (error) {
      this.handlePrismaError(error, 'crear');
    }
  }

  async update(id: string, dto: UpdateEpisodeDto) {
    const current = await this.prisma.episode.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('Episodio no encontrado');
    const seriesId = dto.seriesId?.trim() ?? current.seriesId;
    const seasonId = dto.seasonId ?? current.seasonId;
    const season = await this.prisma.season.findFirst({ where: { id: seasonId, seriesId, deletedAt: null } });
    if (!season) throw new BadRequestException('La temporada no pertenece a la serie seleccionada');
    const markers = { introStartSec: dto.introStartSec !== undefined ? dto.introStartSec : current.introStartSec, introEndSec: dto.introEndSec !== undefined ? dto.introEndSec : current.introEndSec, recapStartSec: dto.recapStartSec !== undefined ? dto.recapStartSec : current.recapStartSec, recapEndSec: dto.recapEndSec !== undefined ? dto.recapEndSec : current.recapEndSec };
    validatePlaybackMarkers(markers, dto.durationSec ?? current.durationSec);
    const video = normalizeVideo({ videoUrl: dto.videoUrl ?? current.videoUrl, videoSource: dto.videoSource ?? current.videoSource, videoType: dto.videoType ?? current.videoType, originalVideoUrl: dto.originalVideoUrl ?? current.originalVideoUrl ?? undefined, processedVideoUrl: dto.processedVideoUrl ?? current.processedVideoUrl ?? undefined });
    await this.assertLocalReady(video);
    try {
      return await this.prisma.episode.update({
        where: { id },
        data: { seriesId, seasonId, number: dto.episodeNumber, position: dto.position, title: dto.title?.trim(), description: dto.description?.trim(), videoUrl: video.videoUrl, originalVideoUrl: video.originalVideoUrl, processedVideoUrl: video.processedVideoUrl, thumbnailUrl: dto.thumbnailUrl?.trim(), durationSec: dto.durationSec, introStartSec: dto.introStartSec, introEndSec: dto.introEndSec, recapStartSec: dto.recapStartSec, recapEndSec: dto.recapEndSec, published: dto.published, videoSource: video.videoSource, videoType: video.videoType, publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined },
        include: { season: true, series: true, subtitles: true },
      });
    } catch (error) {
      this.handlePrismaError(error, 'actualizar');
    }
  }

  async bulkCreate(dto: BulkCreateEpisodesDto) {
    const normalized = dto.episodes.map((item) => ({ item, video: normalizeVideo(item) }));
    await Promise.all(normalized.map(({ video }) => this.assertLocalReady(video)));
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const season = await transaction.season.findFirst({ where: { id: dto.seasonId, seriesId: dto.seriesId, deletedAt: null } });
        if (!season) throw new BadRequestException('La temporada no pertenece a la serie seleccionada');
        const requested = normalized.flatMap(({ item }) => item.episodeNumber ? [item.episodeNumber] : []);
        if (new Set(requested).size !== requested.length) throw new BadRequestException('Hay numeros de episodio duplicados en el lote');
        if (requested.length && await transaction.episode.count({ where: { seasonId: dto.seasonId, number: { in: requested }, deletedAt: null } })) throw new ConflictException('Uno o mas numeros de episodio ya existen en la temporada');
        const aggregate = await transaction.episode.aggregate({ where: { seasonId: dto.seasonId, deletedAt: null }, _max: { number: true, position: true } });
        let nextNumber = aggregate._max.number ?? 0;
        let nextPosition = aggregate._max.position ?? 0;
        const created = [];
        for (const { item, video } of normalized) {
          const number = item.episodeNumber ?? ++nextNumber;
          nextNumber = Math.max(nextNumber, number);
          nextPosition += 1;
          created.push(await transaction.episode.create({
            data: { seriesId: dto.seriesId, seasonId: dto.seasonId, number, position: nextPosition, title: item.title.trim(), description: item.description?.trim() || '', videoUrl: video.videoUrl, originalVideoUrl: video.originalVideoUrl, processedVideoUrl: video.processedVideoUrl, videoSource: video.videoSource, videoType: video.videoType, thumbnailUrl: item.thumbnailUrl?.trim() || null, durationSec: item.durationSec, published: item.published ?? false, publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date() },
            include: { season: true, series: true },
          }));
        }
        return { created };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      this.handlePrismaError(error, 'crear el lote de');
    }
  }

  async reorder(dto: ReorderEpisodesDto) {
    if (new Set(dto.items.map((item) => item.id)).size !== dto.items.length) throw new BadRequestException('Hay episodios duplicados en la solicitud');
    const count = await this.prisma.episode.count({ where: { seasonId: dto.seasonId, deletedAt: null, id: { in: dto.items.map((item) => item.id) } } });
    if (count !== dto.items.length) throw new BadRequestException('Todos los episodios deben pertenecer a la temporada');
    await this.prisma.$transaction(dto.items.map((item) => this.prisma.episode.update({ where: { id: item.id }, data: { position: item.position } })));
    return { reordered: dto.items.length };
  }

  async publish(dto: PublishEpisodesDto) {
    const ids = [...new Set(dto.ids)];
    const result = await this.prisma.episode.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { published: dto.published } });
    if (result.count !== ids.length) throw new BadRequestException('Uno o mas episodios no existen');
    return { updated: result.count, published: dto.published };
  }

  async copySettings(dto: CopyEpisodeSettingsDto) {
    const source = await this.prisma.episode.findFirst({ where: { id: dto.sourceEpisodeId, deletedAt: null } });
    if (!source) throw new NotFoundException('Episodio de origen no encontrado');
    const targetIds = [...new Set(dto.targetEpisodeIds.filter((id) => id !== source.id))];
    const targets = await this.prisma.episode.count({ where: { id: { in: targetIds }, deletedAt: null } });
    if (!targetIds.length || targets !== targetIds.length) throw new BadRequestException('Uno o mas episodios de destino no existen');
    const fields = dto.fields ?? ['video', 'thumbnail', 'duration'];
    const data: Prisma.EpisodeUpdateManyMutationInput = {};
    if (fields.includes('video')) Object.assign(data, { videoUrl: source.videoUrl, originalVideoUrl: source.originalVideoUrl, processedVideoUrl: source.processedVideoUrl, videoSource: source.videoSource, videoType: source.videoType });
    if (fields.includes('thumbnail')) data.thumbnailUrl = source.thumbnailUrl;
    if (fields.includes('description')) data.description = source.description;
    if (fields.includes('duration')) data.durationSec = source.durationSec;
    const result = await this.prisma.episode.updateMany({ where: { id: { in: targetIds }, deletedAt: null }, data });
    return { updated: result.count };
  }

  async gaps(seasonId: string) {
    const episodes = await this.prisma.episode.findMany({ where: { seasonId, deletedAt: null }, select: { number: true }, orderBy: { number: 'asc' } });
    return findMissingEpisodeNumbers(episodes.map((episode) => episode.number));
  }

  remove(id: string) {
    return this.prisma.episode.update({ where: { id }, data: { deletedAt: new Date(), published: false } });
  }

  private async assertLocalReady(video: NormalizedVideo) {
    if (video.videoSource !== VideoSource.LOCAL) return;
    const match = /^\/(?:uploads|api\/storage\/objects)\/(.+)$/.exec(video.videoUrl);
    const media = match ? await this.prisma.mediaFile.findUnique({ where: { relativePath: match[1] }, select: { status: true } }) : null;
    if (!media || media.status !== MediaStatus.READY) throw new ConflictException('El video local aun no termino de procesarse');
  }

  private handlePrismaError(error: unknown, action: string): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('Ya existe un episodio con ese numero para la temporada seleccionada');
      if (error.code === 'P2003') throw new BadRequestException('La serie o temporada seleccionada no existe');
      if (error.code === 'P2025') throw new NotFoundException('El episodio, serie o temporada no fue encontrado');
    }
    this.logger.error(`No se pudo ${action} episodio`, error instanceof Error ? error.stack : String(error));
    throw new InternalServerErrorException(`No se pudo ${action} episodio. Revisa los datos enviados y los logs del backend.`);
  }
}
