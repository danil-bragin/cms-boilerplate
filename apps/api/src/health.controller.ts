import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/auth.guard.js';

@Controller('health')
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get()
  health() {
    return { ok: true };
  }
}
