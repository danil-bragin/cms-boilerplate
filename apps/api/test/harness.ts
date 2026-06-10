import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Test } from '@nestjs/testing';
import { Module, type DynamicModule, type INestApplication, type ModuleMetadata } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb, type Db, sites, users } from '@cms/db';
import type { AuthContext } from '@cms/auth';
import { CONFIG, type AppConfig } from '../src/config/config.js';
import { AUTH_VERIFIER, AuthGuard } from '../src/auth/auth.guard.js';
import { DB } from '../src/db/db.module.js';

const MIGRATIONS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/db/migrations',
);

export const EDITOR: AuthContext = {
  sub: 'test-editor',
  email: 'editor@test.local',
  name: 'Test Editor',
  roles: ['cms-editor'],
};

export const VIEWER: AuthContext = {
  sub: 'test-viewer',
  email: 'viewer@test.local',
  name: 'Test Viewer',
  roles: ['cms-viewer'],
};

export interface TestStack {
  app: INestApplication;
  db: Db;
  cfg: AppConfig;
  siteId: string;
  /** Switch the identity the fake verifier returns. */
  actAs: (user: AuthContext) => void;
  stop: () => Promise<void>;
}

export interface StackOptions {
  metadata: ModuleMetadata;
  withRedis?: boolean;
  withMinio?: boolean;
  /** Provider overrides applied via overrideProvider (e.g. fake revalidate client). */
  overrides?: Array<{ token: unknown; value: unknown }>;
}

export async function startStack(opts: StackOptions): Promise<TestStack> {
  const pg = await new PostgreSqlContainer('postgres:17-alpine').start();
  let redis: StartedTestContainer | undefined;
  let minio: StartedTestContainer | undefined;

  if (opts.withRedis) {
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  }
  if (opts.withMinio) {
    minio = await new GenericContainer('minio/minio:latest')
      .withCommand(['server', '/data'])
      .withEnvironment({ MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: 'minioadmin' })
      .withExposedPorts(9000)
      .start();
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
    });
    await s3.send(new CreateBucketCommand({ Bucket: 'cms-media' }));
    s3.destroy();
  }

  const url = pg.getConnectionUri();
  const migrationClient = postgres(url, { max: 1 });
  await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS });
  await migrationClient.end();

  const db = createDb(url, { max: 5 });

  const cfg: AppConfig = {
    DATABASE_URL: url,
    REDIS_URL: redis ? `redis://${redis.getHost()}:${redis.getMappedPort(6379)}` : 'redis://unused:1',
    KEYCLOAK_ISSUER: 'http://localhost:8080/realms/cms',
    KEYCLOAK_API_AUDIENCE: 'cms-api',
    S3_ENDPOINT: minio ? `http://${minio.getHost()}:${minio.getMappedPort(9000)}` : undefined,
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'cms-media',
    S3_ACCESS_KEY_ID: 'minioadmin',
    S3_SECRET_ACCESS_KEY: 'minioadmin',
    S3_FORCE_PATH_STYLE: true,
    WEB_INTERNAL_URL: 'http://localhost:3000',
    REVALIDATE_SECRET: 'test-secret-test-secret-test-secret!',
    API_PORT: 0,
  };

  let current: AuthContext = EDITOR;

  @Module({})
  class TestGlobals {}

  const globals: DynamicModule = {
    module: TestGlobals,
    global: true,
    providers: [
      { provide: CONFIG, useValue: cfg },
      { provide: DB, useValue: db },
      { provide: AUTH_VERIFIER, useValue: async () => current },
    ],
    exports: [CONFIG, DB, AUTH_VERIFIER],
  };

  const { BullModule } = await import('@nestjs/bullmq');
  const bullImports = redis
    ? [BullModule.forRoot({ connection: { host: redis.getHost(), port: redis.getMappedPort(6379) } })]
    : [];

  let builder = Test.createTestingModule({
    ...opts.metadata,
    imports: [globals, ...bullImports, ...(opts.metadata.imports ?? [])],
    providers: [
      ...(opts.metadata.providers ?? []),
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_PIPE, useClass: ZodValidationPipe },
    ],
  });
  for (const o of opts.overrides ?? []) {
    builder = builder.overrideProvider(o.token).useValue(o.value);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  // baseline data every suite needs
  await db.insert(users).values({ id: 'system', email: 'system@test.local' }).onConflictDoNothing();
  const [site] = await db
    .insert(sites)
    .values({ slug: 'test', domains: ['localhost'], defaultLocale: 'en', locales: ['en', 'de'] })
    .returning();

  return {
    app,
    db,
    cfg,
    siteId: site!.id,
    actAs: (u) => {
      current = u;
    },
    stop: async () => {
      await app.close();
      await pg.stop();
      await redis?.stop();
      await minio?.stop();
    },
  };
}
