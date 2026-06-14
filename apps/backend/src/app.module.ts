import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SeriesModule,
    EpisodesModule,
    MoviesModule,
    FavoritesModule,
    GenresModule,
    CommentsModule,
    UsersModule,
    UploadsModule,
    SettingsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
