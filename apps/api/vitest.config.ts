import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
        target: 'es2022',
      },
    }),
  ],
  test: {
    include: ['test/**/*.int.test.ts', 'src/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
    pool: 'forks',
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@cms/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)),
      '@cms/auth': fileURLToPath(new URL('../../packages/auth/src/index.ts', import.meta.url)),
      '@cms/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
});
