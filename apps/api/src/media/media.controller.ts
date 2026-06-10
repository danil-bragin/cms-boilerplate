import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { mediaListQuery, presignBody } from '@cms/contracts';
import type { AuthContext } from '@cms/auth';
import { Roles } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { MediaService } from './media.service.js';

class PresignDto extends createZodDto(presignBody) {}
class MediaListQueryDto extends createZodDto(mediaListQuery) {}

@Controller()
export class MediaController {
  constructor(@Inject(MediaService) private readonly mediaService: MediaService) {}

  @Post('sites/:siteId/media/presign')
  @Roles('cms-editor')
  presign(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() body: PresignDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.mediaService.presign(siteId, body.filename, body.mime, body.size, user.sub);
  }

  @Post('media/:id/confirm')
  @Roles('cms-editor')
  @HttpCode(202)
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.confirm(id);
  }

  @Get('sites/:siteId/media')
  list(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: MediaListQueryDto) {
    return this.mediaService.list(siteId, query);
  }

  @Delete('media/:id')
  @Roles('cms-editor')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.delete(id);
  }
}
