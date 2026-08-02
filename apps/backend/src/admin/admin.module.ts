import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [AdminController],
  providers: [AdminService, StorageService],
})
export class AdminModule {}
