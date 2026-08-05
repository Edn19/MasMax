import { VideoProcessingTargetType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class EnqueueVideoProcessingDto {
  @IsOptional() @IsEnum(VideoProcessingTargetType) targetType?: VideoProcessingTargetType;
  @ValidateIf((value: EnqueueVideoProcessingDto) => value.targetType !== undefined) @IsString() @Matches(/^[a-zA-Z0-9_-]+$/) targetId?: string;
  @IsOptional() @IsBoolean() retainOriginal?: boolean;
}

export class AssociateVideoProcessingDto {
  @IsEnum(VideoProcessingTargetType) targetType!: VideoProcessingTargetType;
  @IsString() @Matches(/^[a-zA-Z0-9_-]+$/) targetId!: string;
}

export class ConfigureVideoProcessingDto {
  @IsOptional() @IsBoolean() retainOriginal?: boolean;
  @IsOptional() @IsEnum(VideoProcessingTargetType) targetType?: VideoProcessingTargetType;
  @ValidateIf((value: ConfigureVideoProcessingDto) => value.targetType !== undefined || value.targetId !== undefined)
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  targetId?: string;
}
