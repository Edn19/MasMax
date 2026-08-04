import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const videoSources = ['LOCAL', 'URL', 'DRIVE', 'HLS', 'EMBED'] as const;
const videoTypes = ['MP4', 'HLS', 'DRIVE', 'EMBED'] as const;

export class CreateEpisodeDto {
  @IsString() @IsNotEmpty() seriesId!: string;
  @IsOptional() @IsString() @IsNotEmpty() seasonId?: string;
  @Type(() => Number) @IsInt() @Min(1) episodeNumber!: number;
  @IsString() @MinLength(2) title!: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsNotEmpty() videoUrl!: string;
  @IsIn(videoSources) videoSource!: 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
  @IsIn(videoTypes) videoType!: 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
  @IsOptional() @IsString() originalVideoUrl?: string;
  @IsOptional() @IsString() processedVideoUrl?: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationSec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) introStartSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) introEndSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) recapStartSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) recapEndSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsDateString() publishedAt?: string;
}

export class UpdateEpisodeDto {
  @IsOptional() @IsString() seriesId?: string;
  @IsOptional() @IsString() seasonId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) episodeNumber?: number;
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsIn(videoSources) videoSource?: 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
  @IsOptional() @IsIn(videoTypes) videoType?: 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
  @IsOptional() @IsString() originalVideoUrl?: string;
  @IsOptional() @IsString() processedVideoUrl?: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationSec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) introStartSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) introEndSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) recapStartSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) recapEndSec?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsDateString() publishedAt?: string;
}

export class QueryAdminEpisodesDto {
  @IsOptional() @IsString() seriesId?: string;
  @IsOptional() @IsString() seasonId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() published?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}

export class BulkEpisodeItemDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) episodeNumber?: number;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() @IsNotEmpty() videoUrl!: string;
  @IsIn(videoSources) videoSource!: 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
  @IsIn(videoTypes) videoType!: 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
  @IsOptional() @IsString() thumbnailUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationSec?: number;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsDateString() publishedAt?: string;
}

export class BulkCreateEpisodesDto {
  @IsString() @IsNotEmpty() seriesId!: string;
  @IsString() @IsNotEmpty() seasonId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BulkEpisodeItemDto)
  episodes!: BulkEpisodeItemDto[];
}

export class ReorderEpisodeItemDto {
  @IsString() @IsNotEmpty() id!: string;
  @Type(() => Number) @IsInt() @Min(1) position!: number;
}

export class ReorderEpisodesDto {
  @IsString() @IsNotEmpty() seasonId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReorderEpisodeItemDto)
  items!: ReorderEpisodeItemDto[];
}

export class PublishEpisodesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
  @IsBoolean() published!: boolean;
}

export class CopyEpisodeSettingsDto {
  @IsString() @IsNotEmpty() sourceEpisodeId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsString({ each: true }) targetEpisodeIds!: string[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsIn(['video', 'thumbnail', 'description', 'duration'], { each: true })
  fields?: Array<'video' | 'thumbnail' | 'description' | 'duration'>;
}

export class CsvEpisodeImportDto {
  @IsString() @IsNotEmpty() seriesId!: string;
  @IsString() @IsNotEmpty() @MaxLength(2_000_000) csv!: string;
}
