import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config/config.js';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: false });
  app.enableShutdownHooks();
  await app.listen(cfg.API_PORT);
  console.log(`api listening on :${cfg.API_PORT}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
