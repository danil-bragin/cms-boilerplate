import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { publishBody, scheduleBody } from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PublishService } from './publish.service.js';
import { ScheduleService } from './schedule.service.js';

class PublishDto extends createZodDto(publishBody) {}
class ScheduleDto extends createZodDto(scheduleBody) {}

@Controller('page-locales')
export class PublishController {
  constructor(
    @Inject(PublishService) private readonly publishService: PublishService,
    @Inject(ScheduleService) private readonly scheduleService: ScheduleService,
  ) {}

  @Post(':id/publish')
  @Roles('cms-editor')
  publish(@Param('id', ParseUUIDPipe) id: string, @Body() body: PublishDto) {
    return this.publishService.publish(id, body.versionId);
  }

  @Post(':id/unpublish')
  @Roles('cms-editor')
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.publishService.unpublish(id);
  }

  @Get(':id/schedules')
  listSchedules(@Param('id', ParseUUIDPipe) id: string) {
    return this.scheduleService.list(id);
  }

  @Post(':id/schedule')
  @Roles('cms-editor')
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScheduleDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.scheduleService.schedule(id, body.versionId, body.publishAt, user.sub);
  }
}

@Controller('schedules')
export class SchedulesController {
  constructor(@Inject(ScheduleService) private readonly scheduleService: ScheduleService) {}

  @Delete(':id')
  @Roles('cms-editor')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.scheduleService.cancel(id);
  }
}
