import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeVideo } from '../common/video';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEpisodeDto, UpdateEpisodeDto } from './dto';

@Injectable()
export class EpisodesService {
  private readonly logger = new Logger(EpisodesService.name);

  constructor(private readonly prisma: PrismaService) {}

  latest() {
    return this.prisma.episode.findMany({
      where: { deletedAt: null },
      include: { series: { include: { genres: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 24,
    });
  }

  async bySeriesSlug(slug: string) {
    const series = await this.prisma.series.findUnique({ where: { slug } });
    if (!series) throw new NotFoundException('Serie no encontrada');
    return this.prisma.episode.findMany({
      where: { seriesId: series.id, deletedAt: null },
      orderBy: { number: 'asc' },
    });
  }

  async byId(id: string, ip?: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id, deletedAt: null },
      include: { series: { include: { genres: true } } },
    });
    if (!episode) throw new NotFoundException('Episodio no encontrado');
    await this.prisma.$transaction([
      this.prisma.episode.update({ where: { id }, data: { views: { increment: 1 } } }),
      this.prisma.viewLog.create({ data: { episodeId: id, seriesId: episode.seriesId, ip } }),
    ]);
    return episode;
  }

  async create(dto: CreateEpisodeDto) {
    console.log('CREATE EPISODE DTO:', dto);

    const seriesId = dto.seriesId.trim();
    const episodeNumber = Number(dto.episodeNumber);
    if (!seriesId) throw new BadRequestException('Selecciona una serie');
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
      throw new BadRequestException('El numero de episodio debe ser un entero mayor que cero');
    }
    if (!dto.videoUrl?.trim()) throw new BadRequestException('La URL del video es obligatoria');

    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { id: true },
    });
    if (!series) throw new BadRequestException('La serie seleccionada no existe');

    try {
      const video = normalizeVideo(dto);
      return await this.prisma.episode.create({
        data: {
          seriesId,
          number: episodeNumber,
          title: dto.title.trim(),
          description: dto.description?.trim() || '',
          videoSource: video.videoSource,
          videoType: video.videoType,
          videoUrl: video.videoUrl.trim(),
          originalVideoUrl: video.originalVideoUrl?.trim() || null,
          processedVideoUrl: video.processedVideoUrl?.trim() || null,
          thumbnailUrl: dto.thumbnailUrl?.trim() || null,
          publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
        },
        include: { series: true },
      });
    } catch (error) {
      this.handlePrismaError(error, 'crear');
    }
  }

  async update(id: string, dto: UpdateEpisodeDto) {
    const current = await this.prisma.episode.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Episodio no encontrado');
    const video = normalizeVideo({
      videoUrl: dto.videoUrl ?? current.videoUrl,
      videoSource: dto.videoSource ?? current.videoSource,
      videoType: dto.videoType ?? current.videoType,
      originalVideoUrl: dto.originalVideoUrl ?? current.originalVideoUrl ?? undefined,
      processedVideoUrl: dto.processedVideoUrl ?? current.processedVideoUrl ?? undefined,
    });
    return this.prisma.episode.update({
      where: { id },
      data: {
        seriesId: dto.seriesId?.trim(),
        number: dto.episodeNumber,
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        videoUrl: video.videoUrl,
        originalVideoUrl: video.originalVideoUrl,
        processedVideoUrl: video.processedVideoUrl,
        thumbnailUrl: dto.thumbnailUrl?.trim(),
        videoSource: video.videoSource,
        videoType: video.videoType,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
      },
      include: { series: true },
    });
  }

  remove(id: string) {
    return this.prisma.episode.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private handlePrismaError(error: unknown, action: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Ya existe un episodio con ese numero para la serie seleccionada');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('La serie seleccionada no existe o la relacion es invalida');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('El episodio o la serie relacionada no fue encontrado');
      }
    }

    this.logger.error(`No se pudo ${action} el episodio`, error instanceof Error ? error.stack : String(error));
    throw new InternalServerErrorException(
      `No se pudo ${action} el episodio. Revisa los datos enviados y los logs del backend.`,
    );
  }

}
