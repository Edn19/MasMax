import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { EpisodePlaybackMode, Prisma, VideoSource, VideoType } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { normalizeVideo } from '../common/video';
import { PrismaService } from '../prisma/prisma.service';
import { CsvEpisodeImportDto } from './dto';

type CsvRecord = Record<string, string>;
type ImportEpisodeData = Prisma.EpisodeCreateManyInput;
export type EpisodeImportPreviewRow = { row: number; season: number | null; episode: number | null; title: string; valid: boolean; errors: string[]; data?: ImportEpisodeData };

const requiredHeaders = ['season', 'episode', 'title', 'videoUrl'];

export function inferVideoConfiguration(videoUrl: string, source?: string, type?: string) {
  if (source || type) return { videoSource: source || 'URL', videoType: type || (source === 'HLS' ? 'HLS' : source === 'DRIVE' ? 'DRIVE' : source === 'EMBED' ? 'EMBED' : 'MP4') };
  if (/^\/uploads\/videos\/[^/]+\.mp4$/i.test(videoUrl)) return { videoSource: VideoSource.LOCAL, videoType: VideoType.MP4 };
  if (/^https:\/\/(drive|docs)\.google\.com\//i.test(videoUrl)) return { videoSource: VideoSource.DRIVE, videoType: VideoType.DRIVE };
  if (/\.m3u8(?:\?.*)?$/i.test(videoUrl)) return { videoSource: VideoSource.HLS, videoType: VideoType.HLS };
  return { videoSource: VideoSource.URL, videoType: VideoType.MP4 };
}

export function parsePublished(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  if (['true', '1', 'yes', 'si'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error('published debe ser true/false, 1/0, yes/no o si/no');
}

@Injectable()
export class EpisodeImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(dto: CsvEpisodeImportDto) {
    let records: CsvRecord[];
    try {
      records = parse(dto.csv, { columns: true, bom: true, skip_empty_lines: true, trim: true, relax_column_count: false }) as CsvRecord[];
    } catch (error) {
      return { rows: [{ row: 1, season: null, episode: null, title: '', valid: false, errors: [`CSV invalido: ${(error as Error).message}`] }], validCount: 0, errorCount: 1 };
    }
    if (records.length > 500) throw new BadRequestException('La importacion admite un maximo de 500 filas');
    const headers = records.length ? Object.keys(records[0]) : [];
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      const message = `Faltan columnas obligatorias: ${missingHeaders.join(', ')}`;
      return { rows: [{ row: 1, season: null, episode: null, title: '', valid: false, errors: [message] }], validCount: 0, errorCount: 1 };
    }

    const series = await this.prisma.series.findFirst({ where: { id: dto.seriesId, deletedAt: null }, select: { id: true } });
    if (!series) throw new BadRequestException('La serie seleccionada no existe');
    const seasons = await this.prisma.season.findMany({ where: { seriesId: dto.seriesId, deletedAt: null }, select: { id: true, number: true } });
    const seasonByNumber = new Map(seasons.map((season) => [season.number, season.id]));
    const existing = await this.prisma.episode.findMany({ where: { seriesId: dto.seriesId, deletedAt: null }, select: { seasonId: true, number: true } });
    const existingKeys = new Set(existing.map((episode) => `${episode.seasonId}:${episode.number}`));
    const fileKeys = new Set<string>();

    const rows: EpisodeImportPreviewRow[] = records.map((record, index) => {
      const errors: string[] = [];
      const seasonNumber = Number(record.season);
      const episodeNumber = Number(record.episode);
      const title = record.title?.trim() ?? '';
      const videoUrl = record.videoUrl?.trim() ?? '';
      const seasonId = Number.isInteger(seasonNumber) && seasonNumber > 0 ? seasonByNumber.get(seasonNumber) : undefined;
      if (!Number.isInteger(seasonNumber) || seasonNumber < 1) errors.push('season debe ser un entero mayor que cero');
      else if (!seasonId) errors.push(`La temporada ${seasonNumber} no existe`);
      if (!Number.isInteger(episodeNumber) || episodeNumber < 1) errors.push('episode debe ser un entero mayor que cero');
      if (title.length < 2) errors.push('title debe tener al menos 2 caracteres');
      if (!videoUrl) errors.push('videoUrl es obligatorio');

      const key = seasonId && Number.isInteger(episodeNumber) ? `${seasonId}:${episodeNumber}` : '';
      if (key && existingKeys.has(key)) errors.push(`El episodio ${episodeNumber} ya existe en la temporada ${seasonNumber}`);
      if (key && fileKeys.has(key)) errors.push(`El episodio ${episodeNumber} esta duplicado dentro del CSV`);
      if (key) fileKeys.add(key);

      let durationSec: number | null = null;
      if (record.duration?.trim()) {
        durationSec = Number(record.duration);
        if (!Number.isInteger(durationSec) || durationSec < 0) errors.push('duration debe ser un entero mayor o igual que cero');
      }
      const publishedAt = record.publishedAt?.trim() ? new Date(record.publishedAt) : new Date();
      if (Number.isNaN(publishedAt.getTime())) errors.push('publishedAt no es una fecha valida');

      let published = false;
      try { published = parsePublished(record.published); } catch (error) { errors.push((error as Error).message); }
      let video: ReturnType<typeof normalizeVideo> | undefined;
      if (videoUrl) {
        try {
          const inferred = inferVideoConfiguration(videoUrl, record.videoSource?.trim().toUpperCase(), record.videoType?.trim().toUpperCase());
          video = normalizeVideo({ videoUrl, originalVideoUrl: videoUrl, videoSource: inferred.videoSource, videoType: inferred.videoType });
        } catch (error) {
          errors.push((error as Error).message);
        }
      }

      const data: ImportEpisodeData | undefined = errors.length || !seasonId || !video ? undefined : {
        seriesId: dto.seriesId,
        seasonId,
        number: episodeNumber,
        position: episodeNumber,
        title,
        description: record.description?.trim() ?? '',
        videoUrl: video.videoUrl,
        originalVideoUrl: video.originalVideoUrl,
        processedVideoUrl: video.processedVideoUrl,
        playbackMode: video.videoType === VideoType.HLS ? EpisodePlaybackMode.HLS : EpisodePlaybackMode.ORIGINAL,
        videoSource: video.videoSource,
        videoType: video.videoType,
        thumbnailUrl: record.thumbnailUrl?.trim() || null,
        durationSec,
        published,
        publishedAt,
      };
      return { row: index + 2, season: Number.isInteger(seasonNumber) ? seasonNumber : null, episode: Number.isInteger(episodeNumber) ? episodeNumber : null, title, valid: errors.length === 0, errors, data };
    });
    return { rows, validCount: rows.filter((row) => row.valid).length, errorCount: rows.filter((row) => !row.valid).length };
  }

  async commit(dto: CsvEpisodeImportDto) {
    const preview = await this.preview(dto);
    if (preview.errorCount || preview.validCount === 0) {
      const firstErrors = preview.rows.filter((row) => !row.valid).slice(0, 5).map((row) => `Fila ${row.row}: ${row.errors.join(', ')}`);
      throw new BadRequestException(`La importacion contiene errores. ${firstErrors.join(' | ')}`);
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const result = await transaction.episode.createMany({ data: preview.rows.map((row) => row.data as ImportEpisodeData) });
        return { imported: result.count };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Otro proceso creo uno de los episodios antes de confirmar la importacion');
      throw error;
    }
  }
}
