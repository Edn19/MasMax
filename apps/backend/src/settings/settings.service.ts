import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const current = await this.prisma.siteSetting.findFirst();
    return current ?? this.prisma.siteSetting.create({ data: {} });
  }

  async update(dto: SiteSettingDto) {
    const current = await this.get();
    const { featuredSeriesIds, sectionOrder, ...data } = dto;
    return this.prisma.siteSetting.update({
      where: { id: current.id },
      data: {
        ...data,
        featuredSeriesIds: featuredSeriesIds as Prisma.InputJsonValue | undefined,
        sectionOrder: sectionOrder as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
