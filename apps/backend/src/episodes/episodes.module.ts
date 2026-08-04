import { Module } from '@nestjs/common';
import { EpisodesController } from './episodes.controller';
import { EpisodeImportService } from './episode-import.service';
import { EpisodesService } from './episodes.service';

@Module({
  controllers: [EpisodesController],
  providers: [EpisodesService, EpisodeImportService],
})
export class EpisodesModule {}
