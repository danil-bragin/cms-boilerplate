import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { CONFIG, type AppConfig } from './config/config.js';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { HealthController } from './health.controller.js';
import { ContentModule } from './content/content.module.js';
import { PublishModule } from './publish/publish.module.js';
import { MediaModule } from './media/media.module.js';

@Module({
  imports: [
    ConfigModule,
    DbModule,
    BullModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => ({ connection: { url: cfg.REDIS_URL } }),
    }),
    // Redis-backed: limits hold across replicas instead of multiplying by N
    ThrottlerModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (cfg: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: seconds(60), limit: 300 }],
        storage: new ThrottlerStorageRedisService(cfg.REDIS_URL),
      }),
    }),
    ContentModule,
    PublishModule,
    MediaModule,
  ],
  controllers: [HealthController],
  providers: [
    // order matters: throttle before token verification — cheap check first
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
