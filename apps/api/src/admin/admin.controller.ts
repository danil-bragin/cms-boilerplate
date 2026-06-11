import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import {
  createRedirectBody,
  createSiteBody,
  createWebhookBody,
  updatePageLocaleBody,
  updateSiteBody,
  upsertMenuBody,
  addMemberBody,
  upsertAuthorBody,
} from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AdminService } from './admin.service.js';
import { GscService } from './gsc.service.js';
import { SiteAccessService } from '../auth/site-access.service.js';

class CreateSiteDto extends createZodDto(createSiteBody) {}
class UpdateSiteDto extends createZodDto(updateSiteBody) {}
class UpdatePageLocaleDto extends createZodDto(updatePageLocaleBody) {}
class CreateRedirectDto extends createZodDto(createRedirectBody) {}
class UpsertMenuDto extends createZodDto(upsertMenuBody) {}
class UpsertAuthorDto extends createZodDto(upsertAuthorBody) {}
class CreateWebhookDto extends createZodDto(createWebhookBody) {}
class AddMemberDto extends createZodDto(addMemberBody) {}

/** Site administration: cms-admin only (editors manage content, not sites). */
@Controller()
@Roles('cms-admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Post('sites')
  createSite(@Body() body: CreateSiteDto) {
    return this.adminService.createSite(body);
  }

  @Patch('sites/:siteId')
  updateSite(@Param('siteId', ParseUUIDPipe) siteId: string, @Body() body: UpdateSiteDto) {
    return this.adminService.updateSite(siteId, body);
  }

  @Get('sites/:siteId/redirects')
  listRedirects(@Param('siteId', ParseUUIDPipe) siteId: string) {
    return this.adminService.listRedirects(siteId);
  }

  @Post('sites/:siteId/redirects')
  createRedirect(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: CreateRedirectDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.adminService.createRedirect(siteId, body, user.sub);
  }

  @Delete('redirects/:id')
  deleteRedirect(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteRedirect(id);
  }

  @Get('sites/:siteId/webhooks')
  listWebhooks(@Param('siteId', ParseUUIDPipe) siteId: string) {
    return this.adminService.listWebhooks(siteId);
  }

  @Post('sites/:siteId/webhooks')
  createWebhook(@Param('siteId', ParseUUIDPipe) siteId: string, @Body() body: CreateWebhookDto) {
    return this.adminService.createWebhook(siteId, body);
  }

  @Delete('webhooks/:id')
  deleteWebhook(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteWebhook(id);
  }

  @Get('sites/:siteId/members')
  listMembers(@Param('siteId', ParseUUIDPipe) siteId: string) {
    return this.adminService.listMembers(siteId);
  }

  @Post('sites/:siteId/members')
  addMember(@Param('siteId', ParseUUIDPipe) siteId: string, @Body() body: AddMemberDto) {
    return this.adminService.addMember(siteId, body.email, body.role);
  }

  @Delete('members/:id')
  removeMember(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.removeMember(id);
  }
}

/** Menus + slug override: editor-level operations. */
@Controller()
@Roles('cms-editor')
export class ContentAdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(SiteAccessService) private readonly access: SiteAccessService,
    @Inject(GscService) private readonly gsc: GscService,
  ) {}

  @Get('sites/:siteId/gsc/inspect')
  async gscInspect(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('locale') locale: string,
    @Query('path') path: string,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, siteId, false);
    return this.gsc.inspectPage(siteId, locale || 'en', path || '/');
  }

  @Get('sites/:siteId/menus')
  async listMenus(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, siteId, false);
    return this.adminService.listMenus(siteId);
  }

  @Put('sites/:siteId/menus')
  async upsertMenu(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: UpsertMenuDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, siteId);
    return this.adminService.upsertMenu(siteId, body);
  }

  @Delete('menus/:id')
  async deleteMenu(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForMenu(id));
    return this.adminService.deleteMenu(id);
  }

  @Get('sites/:siteId/authors')
  async listAuthors(@Param('siteId', ParseUUIDPipe) siteId: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, siteId, false);
    return this.adminService.listAuthors(siteId);
  }

  @Put('sites/:siteId/authors')
  async upsertAuthor(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: UpsertAuthorDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, siteId);
    return this.adminService.upsertAuthor(siteId, body);
  }

  @Delete('authors/:id')
  async deleteAuthor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForAuthor(id));
    return this.adminService.deleteAuthor(id);
  }

  @Patch('page-locales/:id')
  async updatePageLocale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePageLocaleDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForPageLocale(id));
    return this.adminService.updatePageLocale(id, body.slugOverride);
  }
}
