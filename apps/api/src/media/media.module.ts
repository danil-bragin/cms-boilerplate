import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaService, MEDIA_QUEUE } from './media.service.js';
import { MediaController } from './media.controller.js';
import { S3, createS3Client } from './s3.provider.js';
import { CONFIG, type AppConfig } from '../config/config.js';

@Module({
  imports: [BullModule.registerQueue({ name: MEDIA_QUEUE })],
  controllers: [MediaController],
  providers: [
    MediaService,
    { provide: S3, inject: [CONFIG], useFactory: (cfg: AppConfig) => createS3Client(cfg) },
  ],
  exports: [MediaService],
})
export class MediaModule {}
