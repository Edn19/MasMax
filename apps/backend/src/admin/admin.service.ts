import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const [series, episodes, movies, users, viewLogs] = await Promise.all([
      this.prisma.series.count(),
      this.prisma.episode.count(),
      this.prisma.movie.count(),
      this.prisma.user.count(),
      this.prisma.viewLog.count(),
    ]);
    return { series, episodes, movies, users, totalViews: viewLogs };
  }
}
