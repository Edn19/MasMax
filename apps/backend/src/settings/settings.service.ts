import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.siteSetting.upsert({ where: { key: 'default' }, create: { key: 'default' }, update: {} });
  }

  async update(dto: SiteSettingDto) {
    const { featuredSeriesIds, sectionOrder, ...data } = dto;
    return this.prisma.siteSetting.upsert({
      where: { key: 'default' },
      create: {
        key: 'default',
        ...data,
        featuredSeriesIds: featuredSeriesIds as Prisma.InputJsonValue | undefined,
        sectionOrder: sectionOrder as Prisma.InputJsonValue | undefined,
      },
      update: {
        ...data,
        featuredSeriesIds: featuredSeriesIds as Prisma.InputJsonValue | undefined,
        sectionOrder: sectionOrder as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
