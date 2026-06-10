import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.guard.js';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true };
  }
}
