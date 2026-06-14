export type Role = 'USER' | 'ADMIN';
export type SeriesStatus = 'AIRING' | 'FINISHED' | 'PAUSED';
export type VideoType = 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
export type VideoSource = 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
export type MovieStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

export type Genre = {
  id: string;
  name: string;
  slug: string;
};

export type Series = {
  id: string;
  title: string;
  slug: string;
  description: string;
  cover: string;
  banner: string;
  year: number;
  status: SeriesStatus;
  featured: boolean;
  views: number;
  genres: Genre[];
  episodes?: Episode[];
};

export type Episode = {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  description: string;
  videoUrl: string;
  videoType: VideoType;
  videoSource: VideoSource;
  originalVideoUrl?: string;
  processedVideoUrl?: string;
  thumbnailUrl?: string;
  publishedAt: string;
  views: number;
  series?: Series;
};

export type Movie = {
  id: string;
  title: string;
  slug: string;
  description: string;
  posterUrl: string;
  bannerUrl: string;
  videoSource: VideoSource;
  videoType: VideoType;
  videoUrl: string;
  originalVideoUrl?: string;
  processedVideoUrl?: string;
  duration: number;
  releaseYear: number;
  genres: Genre[];
  status: MovieStatus;
  views: number;
  createdAt: string;
  updatedAt: string;
};

export type Favorite = {
  id: string;
  userId: string;
  episodeId?: string;
  movieId?: string;
  episode?: Episode;
  movie?: Movie;
  createdAt: string;
};

export type User = {
  sub?: string;
  id?: string;
  email: string;
  name: string;
  role: Role;
  active?: boolean;
};

export type Comment = {
  id: string;
  body: string;
  approved: boolean;
  createdAt: string;
  user: { name: string; email?: string };
  episode?: Episode;
};

export type Stats = {
  series: number;
  episodes: number;
  movies: number;
  users: number;
  totalViews: number;
};

export type SiteSetting = {
  id: string;
  siteName: string;
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  colorMode: 'dark' | 'light';
  heroTitle: string;
  heroText: string;
  heroImage?: string;
  featuredSeriesIds: string[];
  sectionOrder: string[];
  showLatestEpisodes: boolean;
  showPopularSeries: boolean;
  showGenres: boolean;
  showComments: boolean;
  showFooter: boolean;
  footerText: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
};
