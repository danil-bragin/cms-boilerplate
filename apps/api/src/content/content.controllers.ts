import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { addLocaleBody, createPageBody, saveDraftBody } from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PagesService } from './pages.service.js';
import { VersionsService } from './versions.service.js';

class CreatePageDto extends createZodDto(createPageBody) {}
class AddLocaleDto extends createZodDto(addLocaleBody) {}
class SaveDraftDto extends createZodDto(saveDraftBody) {}

@Controller('sites')
export class SitesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  listSites() {
    return this.pagesService.listSites();
  }

  @Get(':siteId/pages')
  listPages(@Param('siteId', ParseUUIDPipe) siteId: string) {
    return this.pagesService.listPages(siteId);
  }

  @Post(':siteId/pages')
  @Roles('cms-editor')
  createPage(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: CreatePageDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.pagesService.createPage(siteId, body.path, body.name, user.sub);
  }
}

@Controller()
export class PagesController {
  constructor(
    private readonly pagesService: PagesService,
    private readonly versionsService: VersionsService,
  ) {}

  @Post('pages/:pageId/locales')
  @Roles('cms-editor')
  addLocale(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: AddLocaleDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.pagesService.addLocale(pageId, body.locale, user.sub);
  }

  @Get('page-locales/:id/versions')
  listVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.versionsService.listVersions(id);
  }

  @Get('versions/:id')
  getVersion(@Param('id', ParseUUIDPipe) id: string) {
    return this.versionsService.getVersion(id);
  }

  @Put('page-locales/:id/draft')
  @Roles('cms-editor')
  saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveDraftDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.versionsService.saveDraft(id, body.puckData, user.sub, body.baseVersionNo);
  }
}
