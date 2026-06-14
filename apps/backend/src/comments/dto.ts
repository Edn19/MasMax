import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  episodeId!: string;

  @IsString()
  @MinLength(2)
  body!: string;
}

export class UpdateCommentDto {
  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}
