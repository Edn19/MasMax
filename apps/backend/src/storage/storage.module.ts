import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageDriver } from './local-storage.driver';
import { ObjectStorageService } from './object-storage.service';
import { S3StorageDriver } from './s3-storage.driver';
import { StorageController } from './storage.controller';
import { STORAGE_DRIVER } from './storage.types';

@Global()
@Module({
  controllers: [StorageController],
  providers: [
    { provide: STORAGE_DRIVER, inject: [ConfigService], useFactory: (config: ConfigService) => config.get<string>('STORAGE_DRIVER') === 's3' ? new S3StorageDriver(config) : new LocalStorageDriver(config) },
    ObjectStorageService,
  ],
  exports: [ObjectStorageService],
})
export class StorageModule {}
