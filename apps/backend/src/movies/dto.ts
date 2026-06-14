import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateMovieDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() slug?: string;
  @IsString() description!: string;
  @IsString() posterUrl!: string;
  @IsString() bannerUrl!: string;
  @IsIn(['LOCAL', 'URL', 'DRIVE', 'HLS', 'EMBED']) videoSource!: 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
  @IsIn(['MP4', 'HLS', 'DRIVE', 'EMBED']) videoType!: 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
  @IsString() videoUrl!: string;
  @IsOptional() @IsString() originalVideoUrl?: string;
  @IsOptional() @IsString() processedVideoUrl?: string;
  @Type(() => Number) @IsInt() @Min(1) duration!: number;
  @Type(() => Number) @IsInt() @Min(1900) @Max(2200) releaseYear!: number;
  @IsArray() @IsString({ each: true }) genreIds!: string[];
  @IsIn(['DRAFT', 'PUBLISHED', 'HIDDEN']) status!: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
}

export class UpdateMovieDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() posterUrl?: string;
  @IsOptional() @IsString() bannerUrl?: string;
  @IsOptional() @IsIn(['LOCAL', 'URL', 'DRIVE', 'HLS', 'EMBED']) videoSource?: 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
  @IsOptional() @IsIn(['MP4', 'HLS', 'DRIVE', 'EMBED']) videoType?: 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
  @IsOptional() @IsString() videoUrl?: string;
  @IsOptional() @IsString() originalVideoUrl?: string;
  @IsOptional() @IsString() processedVideoUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) duration?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2200) releaseYear?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) genreIds?: string[];
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'HIDDEN']) status?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
}
