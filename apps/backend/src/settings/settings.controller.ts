import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { SiteSettingDto } from './dto';
import { SettingsService } from './settings.service';

@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  @UseGuards(JwtAuthGuard, AdminGuard)
  get() {
    return this.settings.get();
  }

  @Get('site-settings')
  getSiteSettings() {
    return this.settings.get();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/settings')
  update(@Body() dto: SiteSettingDto) {
    return this.settings.update(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch('admin/site-settings')
  updateSiteSettings(@Body() dto: SiteSettingDto) {
    return this.settings.update(dto);
  }
}
