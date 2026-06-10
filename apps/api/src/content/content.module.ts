import { Module } from '@nestjs/common';
import { PagesService } from './pages.service.js';
import { VersionsService } from './versions.service.js';
import { PagesController, SitesController } from './content.controllers.js';

@Module({
  controllers: [SitesController, PagesController],
  providers: [PagesService, VersionsService],
  exports: [PagesService, VersionsService],
})
export class ContentModule {}
