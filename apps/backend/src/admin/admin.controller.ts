import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/admin.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AdminService } from './admin.service';
import { StorageService } from './storage.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly storage: StorageService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }
  @Get('storage') storageStats() { return this.storage.stats(); }
  @Post('storage/cleanup') cleanupStorage() { return this.storage.cleanup(); }
  @Delete('storage/:id') removeStorage(@Param('id') id: string) { return this.storage.remove(id); }
}
