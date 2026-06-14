import { IsArray, IsBoolean, IsHexColor, IsIn, IsOptional, IsString } from 'class-validator';

export class SiteSettingDto {
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() logo?: string;
  @IsOptional() @IsString() favicon?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() secondaryColor?: string;
  @IsOptional() @IsIn(['dark', 'light']) colorMode?: 'dark' | 'light';
  @IsOptional() @IsString() heroTitle?: string;
  @IsOptional() @IsString() heroText?: string;
  @IsOptional() @IsString() heroImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) featuredSeriesIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sectionOrder?: string[];
  @IsOptional() @IsBoolean() showLatestEpisodes?: boolean;
  @IsOptional() @IsBoolean() showPopularSeries?: boolean;
  @IsOptional() @IsBoolean() showGenres?: boolean;
  @IsOptional() @IsBoolean() showComments?: boolean;
  @IsOptional() @IsBoolean() showFooter?: boolean;
  @IsOptional() @IsString() footerText?: string;
  @IsOptional() @IsString() facebook?: string;
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() youtube?: string;
  @IsOptional() @IsString() tiktok?: string;
}
