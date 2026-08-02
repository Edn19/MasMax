import { IsOptional, IsString } from 'class-validator';
export class AuthorizeMediaDto {
  @IsOptional() @IsString() episodeId?: string;
  @IsOptional() @IsString() movieId?: string;
}
