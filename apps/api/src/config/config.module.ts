import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfig } from './config.js';
import { AUTH_VERIFIER, createAuthVerifier } from '../auth/auth.guard.js';
import { SiteAccessService } from '../auth/site-access.service.js';

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig() },
    { provide: AUTH_VERIFIER, inject: [CONFIG], useFactory: createAuthVerifier },
    SiteAccessService,
  ],
  exports: [CONFIG, AUTH_VERIFIER, SiteAccessService],
})
export class ConfigModule {}
