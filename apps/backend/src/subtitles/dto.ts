import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

function multipartBoolean({ value }: { value: unknown }) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export class QuerySubtitlesDto {
  @IsOptional() @IsString() episodeId?: string;
  @IsOptional() @IsString() movieId?: string;
}

export class CreateSubtitleDto {
  @ValidateIf((dto: CreateSubtitleDto) => !dto.movieId) @IsString() @IsNotEmpty() episodeId?: string;
  @ValidateIf((dto: CreateSubtitleDto) => !dto.episodeId) @IsString() @IsNotEmpty() movieId?: string;
  @IsString() @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, { message: 'language debe ser un codigo como es, en o es-PE' }) language!: string;
  @IsString() @MinLength(2) @MaxLength(80) label!: string;
  @IsOptional() @Transform(multipartBoolean) @IsBoolean() isDefault?: boolean;
  @IsOptional() @Transform(multipartBoolean) @IsBoolean() isForced?: boolean;
  @IsOptional() @Transform(multipartBoolean) @IsBoolean() isActive?: boolean;
}

export class UpdateSubtitleDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, { message: 'language debe ser un codigo valido' }) language?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) label?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isForced?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
