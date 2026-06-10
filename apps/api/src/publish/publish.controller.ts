import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { publishBody, scheduleBody } from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PublishService } from './publish.service.js';
import { SiteAccessService } from '../auth/site-access.service.js';
import { ScheduleService } from './schedule.service.js';

class PublishDto extends createZodDto(publishBody) {}
class ScheduleDto extends createZodDto(scheduleBody) {}

@Controller('page-locales')
@Roles('cms-viewer', 'cms-editor')
export class PublishController {
  constructor(
    @Inject(PublishService) private readonly publishService: PublishService,
    @Inject(ScheduleService) private readonly scheduleService: ScheduleService,
    @Inject(SiteAccessService) private readonly access: SiteAccessService,
  ) {}

  @Post(':id/publish')
  @Roles('cms-editor')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PublishDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForPageLocale(id));
    return this.publishService.publish(id, body.versionId);
  }

  @Post(':id/unpublish')
  @Roles('cms-editor')
  async unpublish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForPageLocale(id));
    return this.publishService.unpublish(id);
  }

  @Get(':id/schedules')
  async listSchedules(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForPageLocale(id), false);
    return this.scheduleService.list(id);
  }

  @Post(':id/schedule')
  @Roles('cms-editor')
  async schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScheduleDto,
    @CurrentUser() user: AuthContext,
  ) {
    await this.access.assertSiteAccess(user, await this.access.siteForPageLocale(id));
    return this.scheduleService.schedule(id, body.versionId, body.publishAt, user.sub);
  }
}

@Controller('schedules')
@Roles('cms-editor')
export class SchedulesController {
  constructor(
    @Inject(ScheduleService) private readonly scheduleService: ScheduleService,
    @Inject(SiteAccessService) private readonly access: SiteAccessService,
  ) {}

  @Delete(':id')
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthContext) {
    await this.access.assertSiteAccess(user, await this.access.siteForSchedule(id));
    return this.scheduleService.cancel(id);
  }
}
