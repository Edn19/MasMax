import { CommentStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  episodeId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  body!: string;
}

export class UpdateCommentDto {
  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional() @IsEnum(CommentStatus) status?: CommentStatus;
  @IsOptional() @IsString() @MaxLength(500) rejectionReason?: string;
}

export class EditCommentDto { @IsString() @MinLength(2) @MaxLength(2000) body!: string; }
