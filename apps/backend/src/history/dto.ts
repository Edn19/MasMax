import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateProgressDto {
  @IsOptional() @IsString() episodeId?: string;
  @IsOptional() @IsString() movieId?: string;
  @IsOptional() @IsString() profileId?: string;
  @Type(() => Number) @IsInt() @Min(0) positionSec!: number;
  @Type(() => Number) @IsInt() @Min(0) durationSec!: number;
  @IsOptional() @IsBoolean() completed?: boolean;
}

export class HistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit = 30;
  @IsOptional() @IsString() profileId?: string;
}

export class ProgressQueryDto {
  @IsOptional() @IsString() episodeId?: string;
  @IsOptional() @IsString() movieId?: string;
  @IsOptional() @IsString() profileId?: string;
}
