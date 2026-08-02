import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
export class CreateListDto { @IsString() @MinLength(1) name!: string; @IsOptional() @IsString() profileId?: string; @IsOptional() @IsBoolean() isPrivate?: boolean; }
export class UpdateListDto { @IsOptional() @IsString() @MinLength(1) name?: string; @IsOptional() @IsBoolean() isPrivate?: boolean; }
export class AddListItemDto { @IsOptional() @IsString() episodeId?: string; @IsOptional() @IsString() movieId?: string; @IsOptional() @IsInt() @Min(0) position?: number; }
