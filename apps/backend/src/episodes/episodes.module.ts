import { Module } from '@nestjs/common';
import { EpisodesController } from './episodes.controller';
import { EpisodeImportService } from './episode-import.service';
import { EpisodesService } from './episodes.service';
import { PlaybackModule } from '../playback/playback.module';

@Module({
  imports: [PlaybackModule],
  controllers: [EpisodesController],
  providers: [EpisodesService, EpisodeImportService],
})
export class EpisodesModule {}
