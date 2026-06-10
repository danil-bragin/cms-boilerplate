import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { publishBody } from '@cms/contracts';
import { Roles } from '../auth/auth.guard.js';
import { PublishService } from './publish.service.js';

class PublishDto extends createZodDto(publishBody) {}

@Controller('page-locales')
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

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
}
