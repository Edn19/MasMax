import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateSeasonDto {
  @IsString()
  @MinLength(1)
  seriesId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  posterUrl?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateSeasonDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) number?: number;
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() posterUrl?: string;
  @IsOptional() @IsBoolean() published?: boolean;
}
