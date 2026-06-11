import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { addLocaleBody, bulkActionBody, createPageBody, saveDraftBody, updatePageBody } from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PagesService } from './pages.service.js';
import { VersionsService } from './versions.service.js';
import { BulkService } from './bulk.service.js';
import { SiteAccessService } from '../auth/site-access.service.js';
import { REVALIDATE_CLIENT, type RevalidateClient } from '../publish/revalidate.client.js';

class CreatePageDto extends createZodDto(createPageBody) {}
class BulkActionDto extends createZodDto(bulkActionBody) {}
class AddLocaleDto extends createZodDto(addLocaleBody) {}
class SaveDraftDto extends createZodDto(saveDraftBody) {}
class UpdatePageDto extends createZodDto(updatePageBody) {}

@Controller('sites')
@Roles('cms-viewer', 'cms-editor')
export class SitesController {
  constructor(
    @Inject(PagesService) private readonly pagesService: PagesService,
    @Inject(SiteAccessService) private readonly access: SiteAccessService,
    @Inject(BulkService) private readonly bulkService: BulkService,
  ) {}

  @Get()
  listSites(@CurrentUser() user: AuthContext) {
    return this.pagesService.listSites(user);
  }

  @Get(':siteId/pages')
  async listPages(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, siteId, false);
    return this.pagesService.listPages(siteId);
  }

  @Post(':siteId/pages')
  @Roles('cms-editor')
  async createPage(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: CreatePageDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, siteId);
    return this.pagesService.createPage(siteId, body.path, body.name, user.sub, body.kind, body.author, body.authorId);
  }

  @Post(':siteId/pages/bulk')
  @Roles('cms-editor')
  async bulk(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: BulkActionDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, siteId);
    return { results: await this.bulkService.run(user, body.action, body.ids, body.locale) };
  }
}

@Controller()
@Roles('cms-viewer', 'cms-editor')
export class PagesController {
  constructor(
    @Inject(PagesService) private readonly pagesService: PagesService,
    @Inject(VersionsService) private readonly versionsService: VersionsService,
    @Inject(SiteAccessService) private readonly access: SiteAccessService,
    @Inject(REVALIDATE_CLIENT) private readonly revalidate: RevalidateClient,
  ) {}

  @Patch('pages/:pageId')
  @Roles('cms-editor')
  async renamePage(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: UpdatePageDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForPage(pageId));
    const { tags, page } = await this.pagesService.renamePage(pageId, body);
    if (tags.length) await this.revalidate.invalidate(tags);
    return page;
  }

  @Post('pages/:pageId/duplicate')
  @Roles('cms-editor')
  async duplicatePage(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: CreatePageDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForPage(pageId));
    return this.pagesService.duplicatePage(pageId, body.path, body.name, user.sub);
  }

  @Delete('pages/:pageId')
  @Roles('cms-editor')
  async deletePage(@Param('pageId', ParseUUIDPipe) pageId: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForPage(pageId));
    const { tags } = await this.pagesService.deletePage(pageId);
    if (tags.length) await this.revalidate.invalidate(tags);
    return { ok: true };
  }

  @Post('pages/:pageId/locales')
  @Roles('cms-editor')
  async addLocale(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() body: AddLocaleDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForPage(pageId));
    return this.pagesService.addLocale(pageId, body.locale, user.sub);
  }

  @Get('page-locales/:id/versions')
  async listVersions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForPageLocale(id), false);
    return this.versionsService.listVersions(id);
  }

  @Get('versions/:id')
  async getVersion(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForVersion(id), false);
    return this.versionsService.getVersion(id);
  }

  @Put('page-locales/:id/draft')
  @Roles('cms-editor')
  async saveDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveDraftDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForPageLocale(id));
    return this.versionsService.saveDraft(id, body.puckData, user.sub, body.baseVersionNo, body.baseUpdatedAt);
  }
}
