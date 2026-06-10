import { Global, Module } from '@nestjs/common';
import { createDb, type Db } from '@cms/db';
import { CONFIG, type AppConfig } from '../config/config.js';

export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig): Db => createDb(cfg.DATABASE_URL, { max: 10 }),
    },
  ],
  exports: [DB],
})
export class DbModule {}

export type { Db };
