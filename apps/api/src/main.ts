import './otel.js'; // must be first: patches http/pg/ioredis at load time
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config/config.js';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule);
  // the 'system' user owns automated writes (auto-redirects, scheduled publishes)
  const { createDb, users } = await import('@cms/db');
  await createDb(cfg.DATABASE_URL, { max: 1 })
    .insert(users)
    .values({ id: 'system', email: 'system@cms.local', displayName: 'System' })
    .onConflictDoNothing();
  const origins = (process.env.WEB_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: false });
  app.enableShutdownHooks();
  await app.listen(cfg.API_PORT);
  console.log(`api listening on :${cfg.API_PORT}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
