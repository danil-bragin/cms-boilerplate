import { Module } from '@nestjs/common';
import { PublishModule } from '../publish/publish.module.js';
import { PagesService } from './pages.service.js';
import { VersionsService } from './versions.service.js';
import { PagesController, SitesController } from './content.controllers.js';

@Module({
  imports: [PublishModule],
  controllers: [SitesController, PagesController],
  providers: [PagesService, VersionsService],
  exports: [PagesService, VersionsService],
})
export class ContentModule {}
