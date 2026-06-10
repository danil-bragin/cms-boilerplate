import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublishService, SEO_PING_QUEUE } from './publish.service.js';
import { PublishController } from './publish.controller.js';
import { HttpRevalidateClient, INVALIDATION_QUEUE, REVALIDATE_CLIENT } from './revalidate.client.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: INVALIDATION_QUEUE }),
    BullModule.registerQueue({ name: SEO_PING_QUEUE }),
  ],
  controllers: [PublishController],
  providers: [PublishService, { provide: REVALIDATE_CLIENT, useClass: HttpRevalidateClient }],
  exports: [PublishService, REVALIDATE_CLIENT],
})
export class PublishModule {}
