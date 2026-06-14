import { IsOptional, IsString } from 'class-validator';

export class CreateFavoriteDto {
  @IsOptional() @IsString() episodeId?: string;
  @IsOptional() @IsString() movieId?: string;
}

export class CheckFavoriteDto {
  @IsOptional() @IsString() episodeId?: string;
  @IsOptional() @IsString() movieId?: string;
}
