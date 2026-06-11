import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { mediaListQuery, presignBody, updateMediaBody } from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { MediaService } from './media.service.js';
import { SiteAccessService } from '../auth/site-access.service.js';

class PresignDto extends createZodDto(presignBody) {}
class MediaListQueryDto extends createZodDto(mediaListQuery) {}
class UpdateMediaDto extends createZodDto(updateMediaBody) {}

@Controller()
@Roles('cms-viewer', 'cms-editor')
export class MediaController {
  constructor(
    @Inject(MediaService) private readonly mediaService: MediaService,
    @Inject(SiteAccessService) private readonly access: SiteAccessService,
  ) {}

  @Post('sites/:siteId/media/presign')
  @Roles('cms-editor')
  @Throttle({ default: { ttl: seconds(60), limit: 30 } })
  async presign(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: PresignDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, siteId);
    return this.mediaService.presign(siteId, body.filename, body.mime, body.size, user.sub);
  }

  @Post('media/:id/confirm')
  @Roles('cms-editor')
  @HttpCode(202)
  async confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForMedia(id));
    return this.mediaService.confirm(id);
  }

  @Get('sites/:siteId/media')
  async list(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: MediaListQueryDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, siteId, false);
    return this.mediaService.list(siteId, query);
  }

  @Patch('media/:id')
  @Roles('cms-editor')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMediaDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForMedia(id));
    return this.mediaService.updateMedia(id, body);
  }

  @Delete('media/:id')
  @Roles('cms-editor')
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForMedia(id));
    return this.mediaService.delete(id);
  }
}
