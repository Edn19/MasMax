import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminMediaQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['ALL', 'EPISODE', 'MOVIE', 'UNASSIGNED', 'UPLOAD']) contentType: 'ALL' | 'EPISODE' | 'MOVIE' | 'UNASSIGNED' | 'UPLOAD' = 'ALL';
  @IsOptional() @IsIn(['ALL', 'UPLOADING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNASSIGNED']) status: 'ALL' | 'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNASSIGNED' = 'ALL';
  @IsOptional() @IsIn(['ALL', 'PUBLISHED', 'DRAFT']) publication: 'ALL' | 'PUBLISHED' | 'DRAFT' = 'ALL';
  @IsOptional() @IsIn(['createdAt', 'updatedAt', 'title', 'size', 'progress']) sort: 'createdAt' | 'updatedAt' | 'title' | 'size' | 'progress' = 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) order: 'asc' | 'desc' = 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
