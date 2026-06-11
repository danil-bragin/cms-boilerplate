import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { GscService } from './gsc.service.js';
import { AdminController, ContentAdminController } from './admin.controller.js';
import { PublishModule } from '../publish/publish.module.js';

@Module({
  imports: [PublishModule],
  controllers: [AdminController, ContentAdminController],
  providers: [AdminService, GscService],
})
export class AdminModule {}
