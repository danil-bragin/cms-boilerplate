import { defineConfig } from '@playwright/test';

/**
 * Expects the full dev stack to be running:
 *   docker compose -f infra/docker-compose.yml up -d
 *   pnpm db:migrate && pnpm db:seed
 *   pnpm dev   (web :3000, api :3001, worker)
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1680, height: 1000 },
  },
});
