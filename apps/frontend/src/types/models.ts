export type Role = 'USER' | 'ADMIN';
export type SeriesStatus = 'AIRING' | 'FINISHED' | 'PAUSED';
export type VideoType = 'MP4' | 'HLS' | 'DRIVE' | 'EMBED';
export type VideoSource = 'LOCAL' | 'URL' | 'DRIVE' | 'HLS' | 'EMBED';
export type MovieStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export type SubtitleFormat = 'VTT' | 'SRT';

export type SubtitleTrack = {
  id: string;
  episodeId?: string;
  movieId?: string;
  language: string;
  label: string;
  url: string;
  originalName: string;
  sourceFormat: SubtitleFormat;
  isDefault: boolean;
  isForced: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

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
  seasons?: Season[];
};

export type Season = {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  description: string;
  posterUrl?: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { episodes: number };
};

export type Episode = {
  id: string;
  seriesId: string;
  seasonId: string;
  number: number;
  position: number;
  title: string;
  description: string;
  videoUrl?: string;
  videoType: VideoType;
  videoSource: VideoSource;
  originalVideoUrl?: string;
  processedVideoUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  introStartSec?: number;
  introEndSec?: number;
  recapStartSec?: number;
  recapEndSec?: number;
  published: boolean;
  publishedAt: string;
  views: number;
  series?: Series;
  season?: Season;
  subtitles?: SubtitleTrack[];
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
  videoUrl?: string;
  originalVideoUrl?: string;
  processedVideoUrl?: string;
  duration: number;
  introStartSec?: number;
  introEndSec?: number;
  recapStartSec?: number;
  recapEndSec?: number;
  releaseYear: number;
  genres: Genre[];
  status: MovieStatus;
  views: number;
  createdAt: string;
  updatedAt: string;
  subtitles?: SubtitleTrack[];
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
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';
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
  activeUsers?: number;
  activeSessions?: number;
  pendingComments?: number;
  processingFiles?: number;
  totals: { series: number; seasons: number | null; episodes: number; movies: number; users: number };
  usersSummary: { total: number; active: number; activeRecently: number; activeSessions: number };
  views: { total: number; daily: Array<{ date: string; views: number }> };
  content: {
    mostViewed: Array<{ id: string; type: 'series' | 'episode' | 'movie'; title: string; subtitle?: string; views: number }>;
    recentlyAdded: Array<{ id: string; type: 'series' | 'episode' | 'movie'; title: string; createdAt: string }>;
    withoutPoster: number;
    seriesWithoutCover: number;
    moviesWithoutPoster: number;
    episodesWithoutVideo: number;
  };
  comments: { pending: number };
  files: {
    processing: number;
    failed: number;
    orphaned: number;
    recentErrors: Array<{ id: string; originalName: string; errorMessage?: string; updatedAt: string }>;
  };
  storage: {
    totalBytes: string;
    totalFiles: number;
    videos: number;
    videoBytes: string;
    images: number;
    imageBytes: string;
    processing: number;
    failed: number;
    orphaned: number;
    orphanedBytes: string;
    freeBytes: string | null;
    driver?: 'local' | 's3';
  };
  health: { backend: 'ok' | 'error'; database: 'ok' | 'error'; storage: 'ok' | 'error' };
  recentActivity: Array<{ id: string; action: string; entity: string; entityId?: string; createdAt: string; actor?: { name: string; email: string } }>;
  generatedAt: string;
};

export type WatchHistory = { id:string;episodeId?:string;movieId?:string;positionSec:number;durationSec:number;percentage:number;completedAt?:string;lastPlayedAt:string;episode?:Episode;movie?:Movie };
export type Session = { id:string;deviceName?:string;userAgent?:string;ipAddress?:string;createdAt:string;lastUsedAt:string;expiresAt:string;revokedAt?:string;revocationReason?:string };
export type Profile = { id:string;name:string;avatarUrl?:string;preferredLanguage:string;isKids:boolean;createdAt:string;lastUsedAt:string };

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
