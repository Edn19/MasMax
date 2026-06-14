import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateEpisodeDto {
  @IsString()
  @IsNotEmpty()
  seriesId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  episodeNumber!: number;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  videoUrl!: string;

  @IsIn(['LOCAL', 'URL', 'DRIVE', 'HLS', 'EMBED'])
  videoSource!: 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';

  @IsIn(['MP4', 'HLS', 'DRIVE', 'EMBED'])
  videoType!: 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';

  @IsOptional()
  @IsString()
  originalVideoUrl?: string;

  @IsOptional()
  @IsString()
  processedVideoUrl?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class UpdateEpisodeDto {
  @IsOptional() @IsString() seriesId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) episodeNumber?: number;
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsIn(['LOCAL', 'URL', 'DRIVE', 'HLS', 'EMBED']) videoSource?: 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
  @IsOptional() @IsIn(['MP4', 'HLS', 'DRIVE', 'EMBED']) videoType?: 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
  @IsOptional() @IsString() originalVideoUrl?: string;
  @IsOptional() @IsString() processedVideoUrl?: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
}
