import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PublishService, SEO_PING_QUEUE, WEBHOOK_QUEUE } from './publish.service.js';
import { ScheduleProcessor, ScheduleService, SCHEDULE_QUEUE } from './schedule.service.js';
import { PublishController, SchedulesController } from './publish.controller.js';
import { CDN_PURGE_QUEUE, HttpRevalidateClient, INVALIDATION_QUEUE, REVALIDATE_CLIENT } from './revalidate.client.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: INVALIDATION_QUEUE }),
    BullModule.registerQueue({ name: SEO_PING_QUEUE }),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    BullModule.registerQueue({ name: SCHEDULE_QUEUE }),
    BullModule.registerQueue({ name: CDN_PURGE_QUEUE }),
  ],
  controllers: [PublishController, SchedulesController],
  providers: [
    PublishService,
    ScheduleService,
    ScheduleProcessor,
    { provide: REVALIDATE_CLIENT, useClass: HttpRevalidateClient },
  ],
  exports: [PublishService, REVALIDATE_CLIENT],
})
export class PublishModule {}
