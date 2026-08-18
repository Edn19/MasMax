import { Module } from '@nestjs/common';
import { EpisodePlaybackReadinessService } from './episode-playback-readiness.service';

@Module({ providers: [EpisodePlaybackReadinessService], exports: [EpisodePlaybackReadinessService] })
export class PlaybackModule {}
