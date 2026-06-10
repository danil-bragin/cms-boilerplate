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
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import {
  createRedirectBody,
  createSiteBody,
  createWebhookBody,
  updatePageLocaleBody,
  updateSiteBody,
  upsertMenuBody,
} from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AdminService } from './admin.service.js';

class CreateSiteDto extends createZodDto(createSiteBody) {}
class UpdateSiteDto extends createZodDto(updateSiteBody) {}
class UpdatePageLocaleDto extends createZodDto(updatePageLocaleBody) {}
class CreateRedirectDto extends createZodDto(createRedirectBody) {}
class UpsertMenuDto extends createZodDto(upsertMenuBody) {}
class CreateWebhookDto extends createZodDto(createWebhookBody) {}

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
}

/** Menus + slug override: editor-level operations. */
@Controller()
@Roles('cms-editor')
export class ContentAdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get('sites/:siteId/menus')
  listMenus(@Param('siteId', ParseUUIDPipe) siteId: string) {
    return this.adminService.listMenus(siteId);
  }

  @Put('sites/:siteId/menus')
  upsertMenu(@Param('siteId', ParseUUIDPipe) siteId: string, @Body() body: UpsertMenuDto) {
    return this.adminService.upsertMenu(siteId, body);
  }

  @Delete('menus/:id')
  deleteMenu(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteMenu(id);
  }

  @Patch('page-locales/:id')
  updatePageLocale(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePageLocaleDto) {
    return this.adminService.updatePageLocale(id, body.slugOverride);
  }
}
