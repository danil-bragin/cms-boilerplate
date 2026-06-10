import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { BullModule } from '@nestjs/bullmq';
import { CONFIG, type AppConfig } from './config/config.js';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { HealthController } from './health.controller.js';
import { ContentModule } from './content/content.module.js';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    BullModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => ({ connection: { url: cfg.REDIS_URL } }),
    }),
    ContentModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
