import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class InitiateResumableUploadDto {
  @IsString() originalName!: string;
  @IsIn(['video/mp4', 'application/mp4', 'application/octet-stream', '']) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) size!: number;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) checksum?: string;
}

export class UploadPartDto {
  @Type(() => Number) @IsInt() @Min(0) index!: number;
  @Matches(/^[a-f0-9]{64}$/i) checksum!: string;
}

export class CompleteResumableUploadDto {
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) checksum?: string;
}
