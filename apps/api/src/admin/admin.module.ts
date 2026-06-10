import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController, ContentAdminController } from './admin.controller.js';
import { PublishModule } from '../publish/publish.module.js';

@Module({
  imports: [PublishModule],
  controllers: [AdminController, ContentAdminController],
  providers: [AdminService],
})
export class AdminModule {}
