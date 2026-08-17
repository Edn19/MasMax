import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { allowedVideoMimeTypes } from '../video-processing/media-probe';

export class InitiateResumableUploadDto {
  @IsString() originalName!: string;
  @IsIn([...allowedVideoMimeTypes]) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) size!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) lastModified?: number;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) checksum?: string;
}

export class UploadPartDto {
  @Type(() => Number) @IsInt() @Min(0) index!: number;
  @Matches(/^[a-f0-9]{64}$/i) checksum!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) attempt?: number;
}

export class CompleteResumableUploadDto {
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) checksum?: string;
  @IsOptional() @IsIn(['ORIGINAL', 'REMUX', 'HLS', 'TRANSCODE']) processingMode: 'ORIGINAL' | 'REMUX' | 'HLS' | 'TRANSCODE' = 'HLS';
}

export class VideoUploadOptionsDto {
  @IsOptional() @IsIn(['ORIGINAL', 'REMUX', 'HLS', 'TRANSCODE']) processingMode: 'ORIGINAL' | 'REMUX' | 'HLS' | 'TRANSCODE' = 'HLS';
}
