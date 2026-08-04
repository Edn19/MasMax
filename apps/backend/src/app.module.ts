import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnvironment } from './common/config';
import { AuditModule } from './audit/audit.module';
import { MediaModule } from './media/media.module';
import { HistoryModule } from './history/history.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ListsModule } from './lists/lists.module';
import { SearchModule } from './search/search.module';
import { SeasonsModule } from './seasons/seasons.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CommentsModule } from './comments/comments.module';
import { EpisodesModule } from './episodes/episodes.module';
import { GenresModule } from './genres/genres.module';
import { FavoritesModule } from './favorites/favorites.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { MoviesModule } from './movies/movies.module';
import { SeriesModule } from './series/series.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';
import { SubtitlesModule } from './subtitles/subtitles.module';
import { StorageModule } from './storage/storage.module';
import { VideoProcessingModule } from './video-processing/video-processing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [{ ttl: Number(config.get<string>('RATE_LIMIT_TTL_SECONDS') ?? 60) * 1000, limit: Number(config.get<string>('RATE_LIMIT_MAX') ?? 100) }],
    }),
    AuditModule,
    StorageModule,
    VideoProcessingModule,
    PrismaModule,
    AuthModule,
    SeriesModule,
    SeasonsModule,
    EpisodesModule,
    MoviesModule,
    FavoritesModule,
    GenresModule,
    CommentsModule,
    UsersModule,
    UploadsModule,
    SubtitlesModule,
    SettingsModule,
    AdminModule,
    MediaModule,
    HistoryModule,
    ProfilesModule,
    ListsModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
