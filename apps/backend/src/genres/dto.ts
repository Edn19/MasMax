import { IsOptional, IsString, MinLength } from 'class-validator';

export class GenreDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;
}
