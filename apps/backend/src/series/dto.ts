import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Min, MinLength } from 'class-validator';

export class QuerySeriesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  status?: 'AIRING' | 'FINISHED' | 'PAUSED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}

export class CreateSeriesDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsUrl({ require_tld: false })
  cover!: string;

  @IsUrl({ require_tld: false })
  banner!: string;

  @IsInt()
  @Min(1900)
  year!: number;

  @IsIn(['AIRING', 'FINISHED', 'PAUSED'])
  status!: 'AIRING' | 'FINISHED' | 'PAUSED';

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsArray()
  @IsString({ each: true })
  genreIds!: string[];
}

export class UpdateSeriesDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() @MinLength(10) description?: string;
  @IsOptional() @IsUrl({ require_tld: false }) cover?: string;
  @IsOptional() @IsUrl({ require_tld: false }) banner?: string;
  @IsOptional() @IsInt() @Min(1900) year?: number;
  @IsOptional() @IsIn(['AIRING', 'FINISHED', 'PAUSED']) status?: 'AIRING' | 'FINISHED' | 'PAUSED';
  @IsOptional() @IsBoolean() featured?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) genreIds?: string[];
}
